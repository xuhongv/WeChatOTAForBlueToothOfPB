import {
  CommandType, DataType, handleConnectionBleDevice, handleGetMTUSize, handleSearchDevice,
  handleWriteOTACommand, SBHAPPType, SBHOTAType, handleListenBLEReceiveData
} from "./blemanager"
import { closeBLEConnection } from "./blewxapi"
import { readSBHFileHandle } from "./filewxapi"
import { calculateCheckSum, checkAPPOTAMAC, getMACFromAdvertisData, getMACFromReadCharacteristic, message, reversalStr, ToHexFormat } from "./util"

var app = getApp()
var isAndroid = app.globalData.isAndroid === true

var deviceId: string //设备的deviceID
var appmac: string  ///App模式下的mac地址
var otaName: string = "PPlusOTA" //OTA模式下的名称
var mfilename: string //升级文件的名称
var otadataArr: AnyArray = [] as AnyArray // 拆分后的升级文件数据，每个元素是一个分区

var flash_addr: number = 0

var progressCallback: Function | undefined = undefined  //进度值回调方法
var OTACompleteCallback: Function | undefined = undefined //OTA升级完成回调方法

var partitionIndex: number = 0
var blockIndex: number = 0

export const SBHAppModeStart = (filename: string, deviceid: string) => {
  mfilename = filename
  if (filename.endsWith("res")) {
    handleWriteOTACommand("0103", deviceid, SBHAPPType, CommandType, rescan)
  } else if (filename.endsWith("hex") || filename.endsWith("hex16")) {
    if (isAndroid) {
      appmac = deviceid
      handleWriteOTACommand("0102", deviceid, SBHAPPType, CommandType, rescan)
    } else {
      //在苹果手机上无法触发数据成功回调
      handleWriteOTACommand("0102", deviceid, SBHAPPType, CommandType)
      setTimeout(() => { rescan() }, 1000)
    }
  } else if (filename.endsWith("hexe16")) {
    console.log("加密OTA的功能还没有写！")
    message("加密OTA的功能还没有写！")
  } else {
    console.log("不支持的文件格式！")
    message("不支持的文件格式！")
  }
}

export const readAppMAC = (mac: string) => {
  if (mac == "00:00:00:00:00:00") return
  appmac = mac
  console.log('读取特性获取MAC值:' + mac)
}

export const SBHSelectedFile = (mPath: string, mDeviceId: string) => {
  deviceId = mDeviceId
  mfilename = mPath
  handleListenBLEReceiveData(SBHReceiveData)
  SBHRequestOTAStart()
}

export const SBHListenProgress = (call: Function) => {
  progressCallback = call
}

export const SBHListenOTAComplete = (call: Function) => {
  OTACompleteCallback = call
}

const rescan = () => {
  console.log("重新扫描......")
  let repeat = true
  //监听扫描到的设备，将设备显示到界面上
  handleSearchDevice(repeat, (devices: AnyArray) => {
    for (var i = 0; i < devices.length; i++) {
      let item = devices[i]
      var otamac: string | undefined = undefined
      if (isAndroid) {
        otamac = item.deviceId
      } else {
        otamac = getMACFromAdvertisData(item.advertisData)
      }

      if (appmac != undefined && otamac != undefined && checkAPPOTAMAC(appmac, otamac)) {
        deviceId = item.deviceId
        connectSBHOTADevice()
        break
      } else if (item.name.startsWith(otaName)) {
        // connectSBHOTADevice()
      }
    }
  }, () => {
    message("请打开定位功能!")
  }, () => {
    message("请打开手机蓝牙!")
  }, () => {
    //开启扫描成功
  })
}

const connectSBHOTADevice = () => {
  handleConnectionBleDevice(deviceId, (data: string) => {
    if (data.length == 16) {
      var mac = data.slice(14, 16) + ":" + data.slice(12, 14) + ":" + data.slice(10, 12)
        + ":" + data.slice(4, 6) + ":" + data.slice(2, 4) + ":" + data.slice(0, 2)
      console.log("获取到MAC地址：" + mac)
    } else {
      SBHReceiveData(data)
    }
  }, (type: number) => {
    console.log("sbh蓝牙双向通道已就绪！" + type)
    if (type == SBHOTAType) SBHRequestOTAStart()
  }, () => {
    console.log("连接失败！")
    message("连接失败！")
  }, () => {
    message("没有找到升级服务!")
  }, () => {
    message("没有找到完整特性!")
  })
}

export const SBHRequestOTAStart = () => {
  if (handleGetMTUSize() < 20) {
    console.log("MTU Size大小异常")
    return
  }
  var mtuSize = handleGetMTUSize()
  partitionIndex = 0
  blockIndex = 0
  otadataArr = []
  readSBHFileHandle(mfilename, (data: string) => {
    var fileLineArray = data.split("\n")
    var baseAddress: string = "" //由baseAddress变为真实行数据的地址
    var partitionContent = []
    var isUpdateBaseflag = true
    var tempStr: string = "" //缓存字符串，将每行的升级数据都放到tempStr，按照MTU进行切割分组
    for (var i = 0; i < fileLineArray.length; i++) {
      var lineData = fileLineArray[i] //每一行的数据
      var dataType = lineData.slice(7, 9) //每一行的数据类型
      var lineSize = parseInt(lineData.slice(1, 3), 16) //每行数据段的长度
      //otadataArr是最终的数据数组，每个元素是一个分区
      if (dataType == "04") {
        //04行的数据段是baseAddress，没有升级数据，直接continue
        if (partitionContent.length > 0) {
          addPartitionToArr(tempStr, partitionContent, mtuSize, baseAddress)
          partitionContent = []
        }
        baseAddress = lineData.slice(9, 13)
        isUpdateBaseflag = true
        tempStr = ""
        continue
      } else if (dataType == "05" || dataType == "01") {
        addPartitionToArr(tempStr, partitionContent, mtuSize, baseAddress)
        sendPartitionCount(otadataArr.length)
        break
      } else if (dataType == "02" || dataType == "03") {
        console.log("hex文件解析，不会执行到这里来!")
      }

      if (isUpdateBaseflag) {
        //在0x04那行判断出需要更新baseAddress，但在下一行才能计算出realAddress
        isUpdateBaseflag = false
        baseAddress = baseAddress + lineData.slice(3, 7)
      }

      tempStr = tempStr + lineData.slice(9, 9 + lineSize * 2)
      if (tempStr.length >= mtuSize * 2) {
        partitionContent.push(tempStr.slice(0, mtuSize * 2))
        tempStr = tempStr.slice(mtuSize * 2, tempStr.length)
      }

    }

  })
}

const addPartitionToArr = (tempStr: string, partitionContent: AnyArray, mtuSize: number, baseAddress: string) => {
  if (tempStr.length > 0) partitionContent.push(tempStr)
  var partitionlength = 2 * mtuSize * (partitionContent.length - 1) + partitionContent[partitionContent.length - 1].length
  var checkSum = calculateCheckSum(partitionContent)
  var tempJson = { "address": baseAddress, "list": partitionContent, "length": partitionlength / 2, "checkSum": checkSum }
  otadataArr.push(tempJson)
}

const sendPartitionCount = (length: number) => {
  let cmdStr = "01" + ToHexFormat(length, 2) + "00"
  handleWriteOTACommand(cmdStr, deviceId, SBHOTAType, CommandType)
}

//收到返回的0x0081,开始发送升级文件信息，flash地址
const sendPartitionMessage = () => {
  if (partitionIndex >= otadataArr.length) {
    message("partitionIndex出错了！")
    return
  }
  var partition = otadataArr[partitionIndex]
  var temp_addr = flash_addr
  //run addr 在11000000 ~ 1107ffff， flash addr=run addr，其余的，flash addr从0开始递增
  var pAddress = parseInt(partition["address"], 16)
  if ((0x11000000 <= pAddress) && (pAddress <= 0x1107ffff)) {
    temp_addr = pAddress
  }
  var cmdStr = markpartitioncmd(partitionIndex, temp_addr, partition["address"], partition["length"], partition["checkSum"])
  handleWriteOTACommand(cmdStr, deviceId, SBHOTAType, CommandType)
}

const markpartitioncmd = (index: number, flash_add: number, run_addr: string, size: number, checkSum: number): string => {
  var fa = reversalStr(ToHexFormat(flash_add, 8), 8)
  var ra = reversalStr(run_addr, 8)
  var sz = reversalStr(ToHexFormat(size, 8), 8)
  var cs = reversalStr(ToHexFormat(checkSum, 4), 4)
  return "02" + ToHexFormat(index, 2) + fa + ra + sz + cs
}

const SBHSendOTAData = () => {
  if (partitionIndex >= otadataArr.length) {
    console.log("数据已经发送完毕")
    return
  }
  var partition = otadataArr[partitionIndex]
  var partitionArray = partition["list"]
  var timecount = 0
  var totalSize = 0
  var currentPartitionSize = 0
  for (var i = 0; i < otadataArr.length; i++) {
    totalSize += otadataArr[i]["length"]
    if (i < partitionIndex) {
      currentPartitionSize += otadataArr[i]["length"]
    }
  }
  var i = setInterval(function () {
    if (blockIndex < partitionArray.length) {
      var cmdStr = partitionArray[blockIndex]
      handleWriteOTACommand(cmdStr, deviceId, SBHOTAType, DataType)
      blockIndex++
      timecount++
    }
    var mtuSize = handleGetMTUSize()
    var currentsize = 0
    if (blockIndex == partitionArray.length) {
      currentsize = currentPartitionSize + otadataArr[partitionIndex]["length"]
    } else {
      currentsize = currentPartitionSize + blockIndex * mtuSize
    }
    var numpercent = (currentsize * 100.0 / totalSize).toFixed(2)
    var showStr = "进度条：" + numpercent
    console.log(showStr)
    if (progressCallback != undefined) progressCallback(showStr)

    if (timecount == 16 || blockIndex >= partitionArray.length) {//一组16个包发送完毕
      clearInterval(i)
    }

  }, 20)
}

const sendReboot = () => {
  handleWriteOTACommand("04", deviceId, SBHAPPType, CommandType)
  setTimeout(() => {
    if (OTACompleteCallback != undefined) OTACompleteCallback()
    closeBLEConnection(deviceId)
  }, 1000)
}

const SBHReceiveData = (data: string) => {
  console.log("SBHReceiveData 收到数据：" + data)
  var dataFlag = parseInt(data, 16)
  switch (dataFlag) {
    case 0x81:
      partitionIndex = 0
      flash_addr = 0
      sendPartitionMessage()
      break
    case 0x83:
      sendReboot()
      break
    case 0x84:
      blockIndex = 0
      SBHSendOTAData()
      break
    case 0x87:
      SBHSendOTAData()
      break
    case 0x85:
      partitionIndex = partitionIndex + 1
      var prePartition = otadataArr[partitionIndex - 1]
      var preAddress = parseInt(prePartition["address"], 16)
      if ((0x11000000 > preAddress) || (preAddress > 0x1107ffff)) {
        flash_addr = flash_addr + prePartition["length"] + 8
      }
      sendPartitionMessage()
      break
    // case 0x6887:
    //   console.log("出错了。。。")
    //   break
    default:
      message("收到未知校验码：" + dataFlag)
  }
}

