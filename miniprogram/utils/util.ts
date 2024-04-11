export const formatTime = (date: Date) => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()
  const millsecond = date.getMilliseconds()

  return (
    [year, month, day].map(formatNumber).join('/') +
    ' ' +
    [hour, minute, second].map(formatNumber).join(':') + ' ' + millsecond
  )
}

const formatNumber = (n: number) => {
  const s = n.toString()
  return s[1] ? s : '0' + s
}


/**
 * 提示弹出框
 * content 提示内容
 * call 回调函数
 * showCancel 是否显示取消按钮
 * title 标题
 */
export const message = (content: string, call?: Function, showCancel = false, title = "提示") => {
  wx.showModal({
    title,
    content,
    showCancel,
    success: (res) => {
      if (res.confirm && call) {
        call()
      }
    }
  })
}

/**
 * 加载进度
 * bool 开关状态
 * title 标题
 * mask 是否显示透明蒙层，防止触摸穿透
 */
export const loading = (bool = true, title = "数据加载中...", mask = true) => {
  if (bool) {
    wx.showLoading({
      title, mask
    })
  } else {
    wx.hideLoading()
  }
}


export const getMACFromAdvertisData = (advertisData: ArrayBuffer): string | undefined => {
  let str = ab2hex(advertisData)
  if (str.length < 16) return undefined
  var mac = str.slice(14, 16) + ":" + str.slice(12, 14) + ":" + str.slice(10, 12)
    + ":" + str.slice(8, 10) + ":" + str.slice(6, 8) + ":" + str.slice(4, 6)
  return mac.toUpperCase()
}

export const getMACFromReadCharacteristic = (advertisData: ArrayBuffer): string | undefined => {
  let str = ab2hex(advertisData)
  if (str.length < 16) return undefined
  var mac = str.slice(14, 16) + ":" + str.slice(12, 14) + ":" + str.slice(10, 12)
    + ":" + str.slice(4, 6) + ":" + str.slice(2, 4) + ":" + str.slice(0, 2)
  return mac.toUpperCase()
}

/**
 * ArrayBuffer转十六进制字符
 */
export const ab2hex = (buffer: ArrayBuffer) => {
  let hexArr = Array.prototype.map.call(
    new Uint8Array(buffer), (bit) => {
      return ('00' + bit.toString(16)).slice(-2)
    })
  return hexArr.join('')
}

/**
 * 十六进制字符串转ArrayBuffer
 * hexString : 十六进制字符串
 */
export const blueToothWriteValue = (hexString: string) => {
  let decimal = hexToByteArray(hexString)
  return decimalToBinary(decimal, Math.ceil(hexString.length / 2))
}

/**
 * 十六进制字符串转Byte数组
 * hexString : 十六进制字符串
 */
export const hexToByteArray = (hexString: string) => {
  let array = []
  if (hexString && hexString.length > 0) {
    let length = hexString.length
    for (let index = 0; index < length; index++) {
      if (index % 2 === 1) {
        let currrentCode = hexString.substr(index - 1, 2)
        array.push(parseInt(currrentCode, 16))
      }
    }
  }
  return array
}

/**
 * Byte数组转ArrayBuffer
*/
export const decimalToBinary = (decimalArray: AnyArray, length: number) => {
  let buffer = new ArrayBuffer(length)
  if (decimalArray.length > 0) {
    let dataView = new DataView(buffer)
    decimalArray.map((item, key) => {
      dataView.setInt8(key, decimalArray[key])
    })
  }
  return buffer
}

/**
 * 将数字类型，按照源数据和指定的长度，生成16进制字符串
 * @param {number} original 
 * @param {number} length 
 * @return 16进制字符串
 */
export const ToHexFormat = (original: number, length: number = 4): string => {
  if (original == undefined) {
    console.log("original 未定义")
    return ""
  }
  var result = original.toString(16)
  while (result.length < length) {
    result = '0' + result
  }
  return result
}

/**
 * 以字节为单位反转字符串
 * @param originalStr 原始字符串
 * @param length 反转后的字符串长度（必须是2的倍数）
 * 例如：
 * originalStr=“123456”，length=8,反转后的结果为 “56341200”
 * originalStr=“123456”，length=6,反转后的结果为 “563412”
 */
export const reversalStr = (originalStr: string, length: number) => {
  var result = ""
  var tempStr = originalStr
  while (tempStr.length < length) {
    tempStr = "0" + tempStr
  }
  for (var i = 0; i < tempStr.length; i = i + 2) {
    result = result + tempStr.slice(tempStr.length - i - 2, tempStr.length - i)
  }
  return result
}


export const crc16_CCITT = (str: string) => {
  var crc = 0xFFFF
  let length = str.length
  for (let index = 0; index < length; index++) {
    if (index % 2 === 1) {
      let oneByte_16 = parseInt(str.substr(index - 1, 2), 16)
      crc ^= oneByte_16 << 8
      for (var j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1)
      }
    }
  }
  crc &= 0xffff
  return crc.toString(16)
}

/**
 * 比较两个mac地址是否是APP模式和OTA模式的MAC+1情况
 * @param appmac 
 * @param otamac 
 */
export const checkAPPOTAMAC = (appmac: string, otamac: string): boolean => {
  if (appmac.length != 17 || otamac.length != 17) return false
  for (var i = 0; i < 13; i = i + 3) {
    let value1 = parseInt(appmac.slice(i, i + 2), 16)
    let value2 = parseInt(otamac.slice(i, i + 2), 16)
    if (value1 != value2) return false
  }
  let value1 = parseInt(appmac.slice(15, 17), 16)
  let value2 = parseInt(otamac.slice(15, 17), 16)
  if (value1 + 1 == value2) return true
  else return false
}

export const calculateCheckSum = (dataArray: AnyArray) => {
  var number = 0
  for (var i = 0; i < dataArray.length; i++) {
    var dataStr: string = dataArray[i]
    for (var j = 0; j < dataStr.length; j = j + 2) {
      number ^= parseInt(dataStr.slice(j, j + 2), 16)
      for (var k = 8; k != 0; k--) { // Loop over each bit
        if ((number & 0x0001) != 0) { // If the LSB is set
          number >>= 1; // Shift right and XOR 0xA001
          number ^= 0xA001;
        } else {
          // Else LSB is not set
          number >>= 1; // Just shift right
        }
      }
    }
  }
  return number
}



