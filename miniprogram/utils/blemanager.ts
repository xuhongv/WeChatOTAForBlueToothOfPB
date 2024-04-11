import {
  checkLocation, startScanBLEDevice, listenDeviceFound, connectionBleDevice, getBleDeviceServices,
  getBleDeviceCharacteristics, listenCharacteristicValueNotify, stopScanBleDevices, bleConnectionStateNotify,
  bleScanStateNotify, closeBLEConnection, handleWriteAction, bleReceiveDataCallNotify, readCharacteristic
} from './blewxapi'
import { loading, message } from './util'

var app = getApp()
var isAndroid = app.globalData.isAndroid === true

export const SLB_SERVICE_UUID = '0000FEB3-0000-1000-8000-00805F9B34FB'
export const SLB_WRITECharacteristic_ID = '0000FED5-0000-1000-8000-00805F9B34FB'
export const SLB_WRITEWithNoRsp_ID = '0000FED7-0000-1000-8000-00805F9B34FB'
export const SLB_NOTIFYCharacteristic_ID = '0000FED8-0000-1000-8000-00805F9B34FB'


export const SBH_APP_SERVICE_UUID = "0000FF01-0000-1000-8000-00805F9B34FB"
export const SBH_APP_WRITE_UUID = "0000FF02-0000-1000-8000-00805F9B34FB"

//获取MAC地址
export const SERVICE_DEVICE_INFO = "0000180A-0000-1000-8000-00805F9B34FB"
export const MAC_READ_CHARACTERISTIC = "00002A23-0000-1000-8000-00805F9B34FB"

export const SBH_OTA_SERVICE_UUID = "5833FF01-9B8B-5191-6142-22A4536EF123"
export const SBH_OTA_WRITE_Characteristic = "5833FF02-9B8B-5191-6142-22A4536EF123"
export const SBH_OTA_NOTIFY_Characteristic = "5833FF03-9B8B-5191-6142-22A4536EF123"
export const SBH_OTA_WRITE_WithNoResponse = "5833FF04-9B8B-5191-6142-22A4536EF123"

/*--------- OTAMethodType ------*/
export const SLBOTAType = 1
export const SBHAPPType = 2
export const SBHOTAType = 3
export const SBHSecurityOTA = 4
/*--------- OTADataType ------*/
export const CommandType = 1
export const DataType = 2


var mtusize = 240

/**
 * 扫描蓝牙设备
 * @param repeat 是否重复
 * @param devicesCall 找到设备后的回调，可能执行多次
 * @param localtionFail 获取定位出错时的回调处理
 * @param bleAdapterFail 蓝牙未打开时的回调处理
 */
export const handleSearchDevice = (repeat: boolean, devicesCall: Function, localtionFail: Function, bleAdapterFail: Function, startScanCall: Function) => {
  if (isAndroid === false) {
    console.log('iOS端设备')
    searchDeviceCommon(repeat, devicesCall, bleAdapterFail, startScanCall)
  } else {
    checkLocation(() => {
      console.log('安卓端设备，获取定位  成功')
      searchDeviceCommon(repeat, devicesCall, bleAdapterFail, startScanCall)
    }, () => {
      console.log('安卓端设备，获取定位  失败')
      localtionFail()
    })
  }
}

/** 
 * 内部方法，扫描设备封装的共同代码部分 
 * @param repeat 
 * @param devicesCall 
 * @param bleAdapterFail 
 */
const searchDeviceCommon = (repeat: boolean, devicesCall: Function, bleAdapterFail: Function, startScanCall: Function) => {
  startScanBLEDevice(repeat, () => {
    console.log("开启扫描成功")
    startScanCall()
    listenDeviceFound(devicesCall)
  }, bleAdapterFail)
}

/**
 * 停止扫描
 * @param call 
 */
export const handleStopScanBleDevices = (call?: Function) => {
  stopScanBleDevices(call)
}

/**
 * 连接蓝牙设备
 * @param deviceId 
 * @param receiveDataCall 
 * @param bleReady 
 * @param connectFail 
 * @param serviceFail 
 * @param characteristicFail 
 */
export const handleConnectionBleDevice = (deviceId: string, receiveDataCall: Function, bleReady: Function, connectFail: Function, serviceFail: Function, characteristicFail: Function) => {
  connectionBleDevice(deviceId, () => {
    //建立连接成功
    getBleDeviceServices(deviceId, (services: AnyArray) => {
      var serviceFlag = 0
      //发现服务成功
      for (let item of services) {
        if (item.uuid.indexOf(SLB_SERVICE_UUID) !== -1) {
          serviceFlag |= 1
        } else if (item.uuid.indexOf(SBH_OTA_SERVICE_UUID) !== -1) {
          serviceFlag |= (1 << 1)
        }
      }

      if (serviceFlag == 0) {
        //如果未能找到设备，回调查找服务失败，断开连接
        serviceFail()
        closeBLEConnection(deviceId)
      } else if (serviceFlag == 1) {
        //SLB设备
        handleSLBCharacteristics(deviceId, SLB_SERVICE_UUID, receiveDataCall, bleReady, characteristicFail)
      } else if (serviceFlag == 2) {
        //SBH设备
        handleSBHOTA(deviceId, SBH_OTA_SERVICE_UUID, receiveDataCall, bleReady, characteristicFail)
        //iOS设备在处理服务时，要获取MAC地址
        if (isAndroid == false) {
          const index = services.findIndex((item) => {
            return item.uuid.indexOf(SERVICE_DEVICE_INFO) !== -1
          })
          if (index !== -1) {
            handleSBHDeviceInfo(deviceId, SERVICE_DEVICE_INFO)
          }
        }
      }else if(serviceFlag == 3){
        message("同时存在两种升级服务！！！")
      }

    }, serviceFail)
  }, connectFail)
}

/**
 * SLB模式下特性处理
 * @param deviceId 
 * @param item 
 * @param receiveDataCall 
 * @param bleReady 
 * @param characteristicFail 
 */
const handleSLBCharacteristics = (deviceId: string, item: string, receiveDataCall: Function, bleReady: Function, characteristicFail: Function) => {
  getBleDeviceCharacteristics(deviceId, item, (characteristics: AnyArray) => {
    var characterFlag = 0
    for (let i = 0; i < characteristics.length; i++) {
      let characteritem = characteristics[i]
      if (characteritem.uuid == SLB_NOTIFYCharacteristic_ID) {
        console.log("找到SLB接收数据特性!")
        characterFlag |= 1
      } else if (characteritem.uuid == SLB_WRITECharacteristic_ID) {
        characterFlag |= (1 << 1)
        console.log("找到SLB写指令特性!")
      } else if (characteritem.uuid == SLB_WRITEWithNoRsp_ID) {
        characterFlag |= (1 << 2)
        console.log("找到SLB OTA数据传输特性!")
      }
    }
    if (characterFlag == 7) {
      console.log("所有SLB特性都OK!")
      handleMTUSize(deviceId)
      listenCharacteristicValueNotify(deviceId, item, SLB_NOTIFYCharacteristic_ID, () => {
        bleReady(SLBOTAType)
      }, receiveDataCall)
    } else {
      characteristicFail()
      console.log("SLB特性异常，未能找到所有特性!")
    }
  }, characteristicFail)
}

/**
 * 处理设备信息
 * @param deviceId 
 * @param item 
 * @param receiveDataCall 
 * @param bleReady 
 * @param characteristicFail 
 */
const handleSBHDeviceInfo = (deviceId: string, item: any) => {
  getBleDeviceCharacteristics(deviceId, item, (characteristics: AnyArray) => {
    var characterFlag = 0
    for (let i = 0; i < characteristics.length; i++) {
      let characteritem = characteristics[i]
      if (characteritem.uuid == MAC_READ_CHARACTERISTIC) {
        characterFlag |= 1
      }
    }
    if (characterFlag == 1) {
      readCharacteristic(deviceId, item, MAC_READ_CHARACTERISTIC)
    } else {
      console.log("SBH 设备特性异常，无法获取MAC地址!")
    }
  })
}

/**
 * SBH OTA模式下特性处理
 * @param deviceId 
 * @param item 
 * @param receiveDataCall 
 * @param bleReady 
 * @param characteristicFail 
 */
const handleSBHOTA = (deviceId: string, item: any, receiveDataCall: Function, bleReady: Function, characteristicFail?: Function) => {
  getBleDeviceCharacteristics(deviceId, item, (characteristics: AnyArray) => {
    var characterFlag = 0
    for (let i = 0; i < characteristics.length; i++) {
      let characteritem = characteristics[i]
      if (characteritem.uuid == SBH_OTA_NOTIFY_Characteristic) {
        characterFlag |= 1
      } else if (characteritem.uuid == SBH_OTA_WRITE_Characteristic) {
        characterFlag |= (1 << 1)
      } else if (characteritem.uuid == SBH_OTA_WRITE_WithNoResponse) {
        characterFlag |= (1 << 2)
        console.log("找到SBH OTA数据传输特性!")
      }
    }
    if (characterFlag == 3) {
      console.log("SBH App模式!")
      bleReady(SBHAPPType)
    } else if (characterFlag == 7) {
      console.log("SBH OTA特性都OK!")
      handleMTUSize(deviceId)
      listenCharacteristicValueNotify(deviceId, item, SBH_OTA_NOTIFY_Characteristic, () => {
        bleReady(SBHOTAType)
      }, receiveDataCall)
    } else {
      console.log("SBH OTA特性异常，未能找到所有特性!")
    }
  }, characteristicFail)
}

const handleMTUSize = (deviceId: string) => {
  if (isAndroid) {
    wx.onBLEMTUChange(function (result) {
      console.log('蓝牙MTU发生变化, mtu is', result.mtu)
      mtusize = result.mtu - 3//安卓中mtu需要减3
    })
    wx.setBLEMTU({
      deviceId: deviceId,
      mtu: 512,
      success(res) {
        console.log("设置MTU成功：" + res)
      }, fail() {
        console.log("设置MTU为512，触发协商，这里是正常的！")
      }
    })

  }
}

/**
 * 监听蓝牙设备的连接状态
 * @param call 
 */
export const handleListenBLEConnection = (call: Function) => {
  bleConnectionStateNotify(call)
}

/**
 * 监听蓝牙适配器和扫描状态
 * @param call 
 */
export const handleListenBLEScan = (call: Function) => {
  bleScanStateNotify(call)
}

/**
 * 页面切换后，新页面监听蓝牙设备特性接收数据
 * @param call 
 */
export const handleListenBLEReceiveData = (call: Function) => {
  bleReceiveDataCallNotify(call)
}

/**
 * 获取MTU Size
 */
export const handleGetMTUSize = () => {
  return mtusize
}

export const handleSetMTUSize = (size : number) => {
  mtusize = size
}

/**
 * 发送OTA指令 
 * @param value 
 * @param deviceId 
 * @param OTAType 
 */
export const handleWriteOTACommand = (value: string, deviceId: string, OTAMethodType: number, OTADataType: number, successCall?: Function) => {
  if (OTAMethodType == SLBOTAType && OTADataType == CommandType) {
    handleWriteAction(value, deviceId, SLB_SERVICE_UUID, SLB_WRITECharacteristic_ID, "write", successCall)
  } else if (OTAMethodType == SLBOTAType && OTADataType == DataType) {
    handleWriteAction(value, deviceId, SLB_SERVICE_UUID, SLB_WRITEWithNoRsp_ID, "writeNoResponse", successCall)
  } else if (OTAMethodType == SBHAPPType && OTADataType == CommandType) {
    handleWriteAction(value, deviceId, SBH_OTA_SERVICE_UUID, SBH_OTA_WRITE_Characteristic, "write", successCall)
  } else if (OTAMethodType == SBHOTAType && OTADataType == CommandType) {
    handleWriteAction(value, deviceId, SBH_OTA_SERVICE_UUID, SBH_OTA_WRITE_Characteristic, "write", successCall)
  } else if (OTAMethodType == SBHOTAType && OTADataType == DataType) {
    handleWriteAction(value, deviceId, SBH_OTA_SERVICE_UUID, SBH_OTA_WRITE_WithNoResponse, "writeNoResponse", successCall)
  }

}



