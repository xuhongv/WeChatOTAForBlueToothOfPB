
import { MAC_READ_CHARACTERISTIC } from './blemanager'
import { readAppMAC } from './sbh_ota'
import { ab2hex, blueToothWriteValue, getMACFromReadCharacteristic } from './util'

export const CONNECT_TIME_OUT = 10000

var bleConnectionCall: Function
var bleScanCall: Function
var bleReceiveDataCall: Function
var isListenBleConnection: boolean = false //蓝牙连接状态监听标志
var connectedArray: AnyArray = [] //连接过和断开连接的数组

/**
  * 获取蓝牙适配器状态，如果获取失败，则初始化蓝牙模块。如果获取成功，执行成功的回调！进一步判断是否需要执行scanCall。
  * noscanCall : 获取蓝牙适配器成功后，未在扫描情况下，要执行的回调操作。
  * scaningCall : 扫描检测回调方法。
  * errorCall : 失败后，要执行的回调操作。（判断用户蓝牙是否打开！）
  */
export const confirmOpenBleAdapter = (noscanCall: Function, scaningCall: Function, errorCall: Function) => {
  wx.getBluetoothAdapterState({
    success: function (res) {
      if (res.available) {
        console.log('蓝牙适配器可用！')
        startListenBLEConnectionState()
        if (res.discovering) {
          console.log('当前正在扫描中！')
          scaningCall()
        } else {
          console.log("当前未扫描!")
          noscanCall()
        }
      } else {
        console.log('蓝牙适配器不可用，是否扫描中：' + res.discovering)
        initBleAdapter(noscanCall, errorCall)
      }
    },
    fail: function (res) {
      console.log(res.errCode + '：获取蓝牙适配器状态失败：' + res.errMsg)
      initBleAdapter(noscanCall, errorCall)
    }
  })
}

/**
  * 初始化蓝牙模块。跟confirmOpenBleAdapter方法中的回调一致。
  * successCall : 成功后，要执行的回调操作。
  * errorCall : 失败后，要执行的回调操作。
  */
const initBleAdapter = (successCall: Function, errorCall: Function) => {

  wx.openBluetoothAdapter({
    mode: "central",
    success: (res) => {
      console.log('以central模式初始化蓝牙模块成功！' + res.errMsg)
      startListenBLEConnectionState()
      successCall()
    }, fail: (res) => {
      console.log(res.errCode + '初始化蓝牙适配器失败' + res.errMsg)
      errorCall()
    }
  })
}

/**
 * 监听蓝牙适配器状态和扫描状态
 * @param call 
 */
export const bleScanStateNotify = (call: Function) => {
  if (bleScanCall == undefined) {
    wx.onBluetoothAdapterStateChange(function (res) {
      console.log('蓝牙适配器监听到数据 ', res)
      if (bleScanCall != undefined) {
        bleScanCall(res)
      } else {
        call(res)
      }
    })
  }
  bleScanCall = call
}

/**
 * 开始搜索附近的蓝牙设备，如果已经有设备连接过，应该找出来，并关闭它。
 * （也可以根据需求，修改这个部分代码，让之前的蓝牙设备继续保持连接，但一定要控制同时连接的个数在10个以内，6~8个最佳）
 * @param repeat 是否重复上报
 * @param successCall 开启扫描成功
 * @param bleAdapterFail 适配器异常回调
 */
export const startScanBLEDevice = (repeat: boolean, successCall: Function, bleAdapterFail: Function) => {
  var scanCall = () => {
    wx.startBluetoothDevicesDiscovery({
      // services: [BLE_SERVICE_UUID],
      allowDuplicatesKey: repeat,
      interval: 1000,//每隔一秒更新一次界面
      success: (res) => {
        console.log('开始搜寻附近的蓝牙外围设备,' + res.errMsg)
        successCall()
      }, fail: (res) => {
        console.log(res.errCode + ':搜寻附近的蓝牙外围设备失败:' + res.errMsg)
      }
    })
  }
  //断开所有已连接的设备 wx.closeBLEConnection
  connectedArray && connectedArray.map(item => {
    if (item.connected) {
      closeBLEConnection(item.deviceId)
    }
  })
  connectedArray = []
  //可以声明一个变量来记录是否已经在扫描中this._discoveryStarted
  confirmOpenBleAdapter(scanCall, () => {
    console.log('不会搜索，已经在扫描中...')
  }, () => {
    console.log('可能需要打开蓝牙，或者运行App使用蓝牙权限！')
    bleAdapterFail()
  })

}

/**
 * 获取在蓝牙模块生效期间所有搜索到的蓝牙设备。包括已经和本机处于连接状态的设备。
 * 使用场景：1.需要断开当前已经连接的设备 2.查找某个设备是否在连接中。
 * call ：将所有设备作为参数返回到call方法处理。
 */
export const getConnectedDevices = (call: Function) => {
  wx.getBluetoothDevices({
    success: (res) => {
      console.log("已连接蓝牙设备:" + res.devices.length + "个")
      call(res.devices)
    },
    fail: (res) => {
      console.log(res.errCode + ":getBluetoothDevices发生错误 " + res.errMsg)
    }
  })
}

/**
 * 安卓端在扫描设备时需要获取定位权限.如果没有开启位置功能，需要开启定位后重新开始扫描。
 * @param successCall 成功获取到定位信息
 * @param errorCall 未能获取到手机位置信息
 */
export const checkLocation = (successCall: Function, errorCall: Function) => {
  wx.getLocation({
    success: (res) => {
      console.log('安卓端获取定位  成功:' + res.errMsg)
      successCall()
    }, fail() {
      console.log('安卓端获取定位  失败')
      errorCall()
    }
  })
}

/**
 * 停止扫描查询设备
 * call:成功停止后，需要执行的方法
*/
export const stopScanBleDevices = (call?: Function) => {
  confirmOpenBleAdapter(() => {
    console.log('未扫描，不需处理停止扫描')
    if (call != undefined) call()
  }, () => {
    wx.stopBluetoothDevicesDiscovery({
      success(res) {
        console.log("成功停止搜索设备:" + res.errMsg)
        if (call != undefined) call()
      }
    })
  }, () => {
    console.log('停止扫描时，获取蓝牙适配器状态失败，不处理')
  })
}

/**
 * 将发现的设备返回，让开发人员决定业务逻辑。
 * 蓝牙设备在被搜索到时，系统返回的 name 字段一般为广播包中的 LocalName 字段中的设备名称，而如果与蓝牙设备建立连接，
 * 系统返回的 name 字段会改为从蓝牙设备上获取到的 GattName。若需要动态改变设备名称并展示，建议使用 localName 字段。
 * call : 回调函数,每查询到一个合适的就调用
 */
export const listenDeviceFound = (call: Function) => {
  wx.onBluetoothDeviceFound((result) => {
    console.log("新搜索到的蓝牙 " + result.devices.length + "个")
    call(result.devices)
  })
}

/**
 * 设置监听BLE设备连接状态回调。每个页面可能需要设置自己的处理方法。
 * @param call 处理蓝牙连接的回调方法。（可以多次修改）
 */
export const bleConnectionStateNotify = (call: Function) => {
  bleConnectionCall = call
}

/**
 * 开启蓝牙连接状态的监听，不要开启多次
 */
export const startListenBLEConnectionState = () => {
  if (isListenBleConnection) return
  isListenBleConnection = true
  wx.onBLEConnectionStateChange(function (res) {
    console.log("设备：" + res.deviceId + ",连接状态：" + res.connected)
    const index = connectedArray.findIndex((item) => {
      return res.deviceId == item.deviceId
    })
    if (index == -1) {
      connectedArray.push(res)
    } else {
      connectedArray[index] = res
    }
    if (bleConnectionCall != undefined) bleConnectionCall(res)
  })
}

/**
 * 连接蓝牙设备。同一个设备deviceID在安卓端和苹果端会不一致。会导致将蓝牙信息保存到服务器的做法有问题，直接连接会出错。
 * deviceId : 设备ID
 * call : 回调方法
 * errorCall : 连接失败回调
 */
export const connectionBleDevice = (deviceId: string, successCall: Function, errorCall: Function) => {
  stopScanBleDevices()
  console.log("连接蓝牙设备 " + deviceId)
  wx.createBLEConnection({
    deviceId,
    timeout: CONNECT_TIME_OUT,
    success: (res) => {
      console.log('成功与设备建立连接:' + res.errMsg)
      successCall()
    }, fail: (res) => {
      if (res.errCode == -1) {
        console.log("设备已经连接！直接操作！")
        successCall()
      } else {
        console.log("蓝牙连接建立失败！" + ",errCode" + res.errCode + "," + res.errMsg)
        errorCall()
        //这里还有第二种做法，一定要连接成功

        // console.log("直接进入搜索连接模式 deviceId:" + deviceId)
        // startScanBLEDevice(true, () => {
        //   listenDeviceFound((result: any[]) => {
        //     for (var i = 0; i < result.length; i++) {
        //       if (result[i].deviceId == deviceId) {
        //         connectionBleDevice(deviceId, successCall, errorCall)
        //         return
        //       }
        //     }
        //   })
        // })
      }
    }
  })

}

/**
 * 获取蓝牙设备服务Services
 * @param deviceId 
 * @param successCall 会将services返回
 * @param errorCall 
 */
export const getBleDeviceServices = (deviceId: string, successCall: Function, errorCall: Function) => {
  wx.getBLEDeviceServices({
    deviceId: deviceId,
    success: (res) => {
      console.log("获取蓝牙服务成功：" + res.errMsg)
      let services = res.services
      successCall(services)
    }, fail: (res) => {
      console.log("获取蓝牙设备服务信息 失败" + res.errCode + " " + res.errMsg)
      errorCall()
    }
  })
}

/**
 * 获取设备特征值
 * @param deviceId 蓝牙设备 id
 * @param serviceId 蓝牙服务 UUID。
 * @param successCall 接口调用成功的回调函数
 * @param errorCall 接口调用失败的回调函数
 */
export const getBleDeviceCharacteristics = (deviceId: string, serviceId: string, successCall: Function, errorCall?: Function) => {
  wx.getBLEDeviceCharacteristics({
    deviceId: deviceId,
    serviceId: serviceId,
    success: (res) => {
      console.log("由服务获取特性成功：" + res.errMsg)
      let characteristics = res.characteristics
      successCall(characteristics)
    }, fail: (res) => {
      console.log(serviceId + "由服务获取特性失败:" + res.errCode + "  " + res.errMsg)
      if (errorCall != undefined) errorCall()
    }
  })
}

/**
 * 每个页面可能需要设置自己收到数据后的处理方法
 * @param call 处理蓝牙连接的回调方法。（可以多次修改）
 */
export const bleReceiveDataCallNotify = (call: Function) => {
  bleReceiveDataCall = call
}

/**
 * 开启接收BLE数据功能，只有开启后才能监听设备特性值变化
 * basis : 设备基本信息
 * call: 回调函数
 */
export const listenCharacteristicValueNotify = (deviceId: string, serviceId: string, characteristicId: string, bleReadyCall: Function, receiveDataCall: Function, errorCall?: Function) => {
  bleReceiveDataCall = receiveDataCall
  wx.notifyBLECharacteristicValueChange({
    deviceId,
    serviceId,
    characteristicId,
    state: true,
    success: (res) => {
      console.log('开启特性值通信监听成功:' + res.errMsg)
      wx.onBLECharacteristicValueChange((characteristic) => {
        // console.log('收到特性值数据:' + ab2hex(characteristic.value))
        bleReceiveDataCall(ab2hex(characteristic.value))
      })
      bleReadyCall()
    },
    fail: (res) => {
      console.log("开启特征值监听失败：" + res.errCode)
      if (errorCall != undefined) errorCall()
    }
  })
}

export const readCharacteristic = (deviceId: string, serviceId: string, characteristicId: string) => {
  // 必须在这里的回调才能获取
  wx.onBLECharacteristicValueChange(function (characteristic) {
    if (characteristic.characteristicId == MAC_READ_CHARACTERISTIC) {
      readAppMAC(getMACFromReadCharacteristic(characteristic.value)!)
    }
  })

  wx.readBLECharacteristicValue({
    deviceId,
    serviceId,
    characteristicId,
    success(res) {
      console.log('readBLECharacteristicValue:', res.errMsg)
    }
  })
}

/**
 * 关闭蓝牙连接
 * @param deviceId 
 */
export const closeBLEConnection = (deviceId: string) => {
  wx.closeBLEConnection({
    deviceId,
    success(res) {
      console.log(deviceId + "成功断开连接：" + res.errMsg)
    }, fail(error) {
      console.log("断开连接失败：" + error.errMsg)
    }
  })
}


/**
 * 写入指令
 * value : 二进制数组
 * call : 回调方法
 */
export const handleWriteAction = (value: string, deviceId: string, serviceId: string, characteristicId: string, wType: any, successCall?: Function, errorCall?: Function) => {
  console.log('写入指令:' + value)
  let binaryValue = blueToothWriteValue(value)
  wx.writeBLECharacteristicValue({
    deviceId,
    serviceId,
    characteristicId,
    value: binaryValue,
    writeType: wType,
    success: (res) => {
      console.log("特性值写入成功，" + res.errMsg)
      if (successCall != undefined) successCall()
    }, fail: (res) => {
      console.log("特性值写入失败，" + res.errCode + res.errMsg)
      if (res.errCode == 10008) {
        if (successCall != undefined) successCall()
      } else {
        if (errorCall != undefined) errorCall()
      }
    }
  })

}
