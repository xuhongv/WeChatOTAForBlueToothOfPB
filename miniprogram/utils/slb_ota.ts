import { CommandType, DataType, handleGetMTUSize, handleListenBLEReceiveData, handleWriteOTACommand, SLBOTAType } from "./blemanager"
import { readSLBFileHandle } from "./filewxapi"
import { ToHexFormat, crc16_CCITT, message, reversalStr } from "./util"

const MESG_HDER_SIZE = 4

const MESG_OPCO_ISSU_VERS_REQU = 0x20;//获取设备固件版本信息
const MESG_OPCO_RESP_VERS_REQU = 0x21;//返回设备固件版本信息
const MESG_OPCO_ISSU_OTAS_REQU = 0x22;//发送升级请求及固件信息
const MESG_OPCO_RESP_OTAS_REQU = 0x23;//返回是否允许升级、上次传输大小以及是否支持快速升级模式
const MESG_OPCO_ISSU_OTAS_SEGM = 0x2F;//发送升级包（OTA数据命令头）
const MESG_OPCO_RESP_OTAS_SEGM = 0x24;//回复接收到的最后帧序号和已接收固件大小
const MESG_OPCO_ISSU_OTAS_COMP = 0x25;//通知固件发送完成并进行校验
const MESG_OPCO_RESP_OTAS_COMP = 0x26;//上报固件校验结果

var frameCount: number = 1

var otadataArr: AnyArray = [] // 拆分后的升级文件数据
var otaindex: number = 0 // 当前传输包的位置
var mBinsFrsz: number = 16 // 一组数据的包个数（1字节，0x00~0x0f，表示1～16包）

var deviceId: string
var path: string
var progressCallback: Function | undefined = undefined
var OTACompleteCallback: Function | undefined = undefined
var isSelectData: boolean = false
var dataStr: string

export const SLBSelectedFile = (mPath: string, mDeviceId: string) => {
  isSelectData = false
  deviceId = mDeviceId
  path = mPath
  handleListenBLEReceiveData(SLBReceiveData)
  SLBCheckDeviceVersion()
}

export const SLBSelectedData = (data: string, mDeviceId: string) => {
  isSelectData = true
  deviceId = mDeviceId
  handleListenBLEReceiveData(SLBReceiveData)
  SLBCheckDeviceVersion()
  dataStr = data
}

export const SLBCheckDeviceVersion = () => {
  const cmd = newSegmMesg(MESG_OPCO_ISSU_VERS_REQU, false, "00", 1, 0)
  handleWriteOTACommand(cmd, deviceId, SLBOTAType, CommandType)
}

export const SLBListenProgress = (call: Function) => {
  progressCallback = call
}

export const SLBListenOTAComplete = (call: Function) => {
  OTACompleteCallback = call
}

// export const SLB
const SLBRequestOTAStart = () => {
  otaindex = 0
  var data: string = dataStr
  if (!isSelectData) {
    readSLBFileHandle(path, (datas: string) => {
      SLBhandleFileData(datas)
    })
  }else {
    SLBhandleFileData(data)
  }
}

const SLBhandleFileData = (data:string) => {
  otadataArr = []
  var contentindex = 0
  const mtusize = (handleGetMTUSize() - 4) * 2  //mtu是字节，这里是字符串，2倍关系
  while (data.length > contentindex * mtusize) {
    if (data.length > (contentindex + 1) * mtusize) {
      otadataArr.push(data.slice(contentindex * mtusize, (contentindex + 1) * mtusize))
    } else {
      otadataArr.push(data.slice(contentindex * mtusize, data.length))
    }
    console.log(otadataArr[contentindex])
    contentindex++
  }
  // 00 + 版本号(4字节) + 文件总大小(4字节) + crc16_ccitt(2字节) + 00
  let commandStr = "0000000000" + reversalStr(ToHexFormat(data.length / 2, 8), 8) + reversalStr(crc16_CCITT(data), 4) + "00"
  console.log("commandStr：" + commandStr)
  const cmd = newSegmMesg(MESG_OPCO_ISSU_OTAS_REQU, false, commandStr, 1, 0)
  handleWriteOTACommand(cmd, deviceId, SLBOTAType, CommandType)
}

const SLBSendOTAData = () => {
  //最后一组可能没有mBinsFrsz个数据包
  var actualFrame = mBinsFrsz
  if (otaindex + mBinsFrsz > otadataArr.length) {
    actualFrame = otadataArr.length - otaindex
  }
  if (actualFrame < 1) {
    console.log("没有数据了，确认完成")
    const cmd = newSegmMesg(MESG_OPCO_ISSU_OTAS_COMP, false, "01", 1, 0)
    handleWriteOTACommand(cmd, deviceId, SLBOTAType, DataType)
  } else {
    var timecount = 0
    const mtusize = handleGetMTUSize() * 2 //mtu是字节，这里是字符串，2倍关系
    var totalSize = (otadataArr.length - 1) * mtusize + otadataArr[otadataArr.length - 1].length
    var i = setInterval(function () {
      const cmd = newSegmMesg(MESG_OPCO_ISSU_OTAS_SEGM, false, otadataArr[otaindex], actualFrame, timecount)
      handleWriteOTACommand(cmd, deviceId, SLBOTAType, DataType)
      timecount++
      otaindex++
      let currentsize = otaindex * mtusize
      var numpercent = (currentsize * 100.0 / totalSize).toFixed(2)
      if (otaindex == otadataArr.length) {
        numpercent = "100.00"
      }
      if (otaindex > otadataArr.length) {
        numpercent = "大于100.00，出错了"
      }
      console.log("进度条：" + numpercent)
      if (progressCallback != undefined) progressCallback("进度条：" + numpercent)
      if (timecount >= actualFrame) {
        clearInterval(i)
      }
    }, 20)
  }
}

const newSegmMesg = (stepType: number, encr: boolean, data: string, totalSize: number, current: number) => {
  var packageSize = handleGetMTUSize() - MESG_HDER_SIZE  // 一包最大的长度
  var actualSize = Math.min(data.length / 2, packageSize) // 实际包长，最后一包没有packageSize
  var header = ToHexFormat(((encr ? 1 : 0) << 4) | (frameCount & 0x0F), 2)
  header += ToHexFormat(stepType, 2)
  header += ToHexFormat((((totalSize - 1) & 0x0F) << 4) | (current & 0x0F), 2)
  header += ToHexFormat(actualSize, 2)
  frameCount++
  frameCount %= 16
  return header + data
}

const SLBReceiveData = (data: string) => {
  console.log("SLBReceive数据：" + data)
  const respondType = parseInt(data.slice(2, 4), 16)
  switch (respondType) {
    case MESG_OPCO_RESP_VERS_REQU:
      SLBRequestOTAStart()
      break

    case MESG_OPCO_RESP_OTAS_REQU:
      mBinsFrsz = parseInt(data.slice(18, 20), 16) + 1
      if (mBinsFrsz != 16) {
        message("一次循环的可传输的包个数不是16，建议改为16.")
      }
      SLBSendOTAData()
      break
    // 02 24 0005 ff 00e10000
    // 03 24 0005 00 40e10000
    case MESG_OPCO_RESP_OTAS_SEGM:
      console.log("收到数据包确认，开始下一段")
      if (data.slice(8, 9) == data.slice(9, 10)) {
        SLBSendOTAData()
      } else {
        console.log("包序号出错!")
      }
      break

    case MESG_OPCO_RESP_OTAS_COMP:
      if (data.slice(8, 10) == "01") {
        console.log("收到固件端确认，升级成功")
        if (OTACompleteCallback != undefined) OTACompleteCallback()
      } else {
        message("所有数据接收后的校验码出错！")
      }
      break

    default:
      message("收到未知校验码：" + respondType)

  }
}

