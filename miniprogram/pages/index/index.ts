import { SBHAPPType, SBHOTAType, SLBOTAType, handleSetMTUSize } from "../../utils/blemanager"
import { copyFileFromWXMessage, readDirHandler } from "../../utils/filewxapi"
import { SBHAppModeStart, SBHListenProgress, SBHListenOTAComplete, SBHSelectedFile } from "../../utils/sbh_ota"
import { SLBListenOTAComplete, SLBListenProgress, SLBSelectedFile, SLBSelectedData } from "../../utils/slb_ota"
import { message } from "../../utils/util"

Page({
  data: {
    motto: '还未选择文件',
    fileList: [] as AnyArray,
    deviceId: "" as any,
    type: -1
  },

  onLoad(options) {
    if (options.deviceId == undefined) wx.navigateBack()
    this.data.deviceId = options.deviceId
    if (options.type != undefined) this.data.type = parseInt(options.type)
    this.readFileTap()
  },

  //第二种OTA逻辑，从服务器获取文件，直接传递字符串数据给插件
  getDataTap() {
    var params = new Map();
    params.set("token", "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxNSJ9.spN26zW2TQG0UIf_ng2CdbZ6fapABZ1Y4UPoECr2ykc");
    wx.request({
      url: "http://192.168.0.75:8081/file/downloadFile?fileId=f90ba8a0d6b44b899a8f1f944e4b27aa",
      data: params,
      method: 'GET',
      success: (result) => {
        console.log("result  *******************************  :" + result.data)
        this.serverDataHandle(result.data as string);
      },
      fail: (result) => {
        console.log("fail  *******************************   : " + JSON.stringify(result));
      }
    })
  },
  //从服务器获取数据后的第二步，仅支持SLBOTA
  serverDataHandle(data: string) {
    handleSetMTUSize(237)
    SLBSelectedData(data, this.data.deviceId)
    SLBListenProgress((progressStr: string) => {
      this.setData({ motto: progressStr })
    })
    SLBListenOTAComplete(() => {
      message("收到固件端确认，升级成功", () => {
        wx.navigateBack()
      })
    })
  },

  //界面按钮事件，选择一个文件进行升级
  selectFileTap(e: any) {
    let item = e.currentTarget.dataset.item
    message("您选择的是：" + item + ",确定开始OTA升级吗？", () => {
      handleSetMTUSize(244)
      if (this.data.type == SLBOTAType && item.endsWith(".bin")) {
        SLBSelectedFile(item, this.data.deviceId)
        SLBListenProgress((progressStr: string) => {
          this.setData({ motto: progressStr })
        })
        SLBListenOTAComplete(() => {
          message("收到固件端确认，升级成功", () => {
            wx.navigateBack()
          })
        })
      } else if (this.data.type == SBHOTAType && (item.endsWith("hex") || item.endsWith("hex16"))) {
        console.log("Single Band OTA 模式")
        SBHSelectedFile(item, this.data.deviceId)
        SBHListenProgress((progressStr: string) => {
          this.setData({ motto: progressStr })
        })
        SBHListenOTAComplete(() => {
          message("收到固件端确认，升级成功", () => {
            wx.navigateBack()
          })
        })
      } else if (this.data.type == SBHAPPType && (item.endsWith("hex") || item.endsWith("hex16"))) {
        SBHAppModeStart(item, this.data.deviceId)
        SBHListenProgress((progressStr: string) => {
          this.setData({ motto: progressStr })
        })
        SBHListenOTAComplete(() => {
          message("收到固件端确认，升级成功", () => {
            wx.navigateBack()
          })
        })
      } else if (item.endsWith("hexe16") && (this.data.type == SBHAPPType)) {
        console.log("加密模式 App模式")
      } else if (item.endsWith("hexe16") && (this.data.type == SBHOTAType)) {
        console.log("加密模式 OTA模式")
      } else {
        this.setData({ motto: "类型："+ this.data.type + ", 文件："+item})
        message("升级方式与文件格式未支持！")
      }
      this.setData({ motto: "正在处理中，请等待!!!" })
    }, true, "请确认")
  },


  //界面按钮事件，从会话框选择文件
  choiceFileTap() {
    copyFileFromWXMessage((myfile: any) => {
      var result = "文件名:" + myfile.name + ",\n大小:" + myfile.size
      console.log(result)
      this.setData({ motto: result })
      this.readFileTap()
    })
  },

  //访问用户空间
  readFileTap() {
    var i = 0, file;
    this.data.fileList = []
    readDirHandler((readfiles: AnyArray) => {
      if (readfiles.length == 0) { //如果没有保存的文件
        console.log("用户空间没有数据!")
      } else {
        for (i = 0; i < readfiles.length; i++) {
          file = readfiles[i]
          if (file == "miniprogramLog") continue
          this.data.fileList.push(file)
        }
        this.setData({ fileList: this.data.fileList })
      }
    })
  },

})
