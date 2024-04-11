// pages/scandevice/scandevice.ts
import {
  handleConnectionBleDevice, handleSearchDevice, handleStopScanBleDevices, handleListenBLEScan, SLBOTAType, SBHAPPType, SBHOTAType
} from "../../utils/blemanager"
import { readAppMAC } from "../../utils/sbh_ota"
import { getMACFromAdvertisData, loading, message } from "../../utils/util"

Page({

  /**
   * 页面的初始数据
   */
  data: {
    deviceList: [] as any[],
    scanState: "初始化中...",
    isScaning: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    //打开页面就开始扫描
    this.searchDevices()
    //监听BLE扫描状态
    handleListenBLEScan((res: any) => {
      if (res.available && res.discovering) {
        this.data.isScaning = true
        this.setData({ scanState: "停止扫描" })
      } else {
        this.data.isScaning = false
        this.setData({ scanState: "开始扫描" })
      }
    })
  },

  searchDevices() {
    //扫描的设备是否重复上报
    let repeat = true
    //监听扫描到的设备，将设备显示到界面上
    handleSearchDevice(repeat, this.handleScanedDevice, () => {
      message("请打开定位功能!")
      this.setData({ scanState: "开始扫描" })
    }, () => {
      message("请打开手机蓝牙!")
      this.setData({ scanState: "开始扫描" })
    }, () => {
      //开启扫描成功
      this.setData({ scanState: "停止扫描" })
    })
  },

  handleScanedDevice(devices: AnyArray) {
    var { deviceList } = this.data
    var date = new Date().getTime()
    for (var i = 0; i < devices.length; i++) {
      let item = devices[i]
      //这里做了一个过滤，如果广播包的localname和Gatt的蓝牙name都为空，则不显示。
      if (!item.name && !item.localName) {
        continue
      }
      console.log(item.name + "," + item.localName + ",deviceId:" + item.deviceId + ", RSSI:" + item.RSSI)
      //判断设备是否是第一次发现
      const index = deviceList.findIndex((oldItem) => {
        return oldItem.deviceId == item.deviceId
      })
      if (item.advertisData != undefined) {
        item.mac = getMACFromAdvertisData(item.advertisData)
        console.log("设备MAC地址是：" + item.mac)
      }
      item.date = date
      if (index == -1) {
        deviceList.push(item)
      } else {
        deviceList[index] = item
      }
    }
    deviceList = deviceList.filter(item =>
      date - item.date < 5000
    )

    deviceList = deviceList.sort((obj1, obj2) => {
      var v1 = obj1.RSSI
      var v2 = obj2.RSSI
      return v2 - v1
    })
    this.setData({ deviceList })

  },

  startOrStopScanTap() {
    if (this.data.scanState == "初始化中...") return
    if (this.data.isScaning) {
      handleStopScanBleDevices()
    } else {
      this.searchDevices()
    }
  },

  connectAction(e: any) {
    let item = e.currentTarget.dataset.item
    loading(true, "蓝牙连接中...")
    handleConnectionBleDevice(item.deviceId, (data: string) => {
      console.log("收到数据1：" + data)
    }, (type: number) => {
      console.log("蓝牙双向通道已就绪！")
      if (type != 0 && item.mac != undefined) readAppMAC(item.mac)
      loading(false)
      var mytitle: string = "连接成功，类型:"
      if (type == SLBOTAType) mytitle = mytitle + "SLB模式"
      else if (type == SBHAPPType) mytitle = mytitle + "SBH App模式"
      else if (type == SBHOTAType) mytitle = mytitle + "SBH OTA模式"
      else mytitle = mytitle + type
      message(mytitle, () => {
        wx.navigateTo({
          url: '../index/index?deviceId=' + item.deviceId + "&type=" + type,
        })
      })
    }, () => {
      console.log("连接失败！")
      loading(false)
    }, () => {
      loading(false)
      message("没有找到升级服务!")
    }, () => {
      message("没有找到完整特性!")
    })
  },
})