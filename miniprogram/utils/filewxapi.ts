

/**
 * 从微信会话框中选择升级文件，默认将文件拷贝到升级
 * @param call 
 */
export const copyFileFromWXMessage = (call: Function) => {
  wx.chooseMessageFile({
    count: 1,
    type: 'file',
    extension: ['hex16', 'hex', 'bin'],
    success(res) {
      const myfile = res.tempFiles[0]
      copyFileToUserEnv(myfile.path, myfile.name, () => {
        call(myfile)
      })
    }
  })
}

export const copyFileToUserEnv = (path: string, name: string, successCall?: Function, copyfail?: Function) => {
  const fs = wx.getFileSystemManager()
  fs.copyFile({
    srcPath: path,
    destPath: `${wx.env.USER_DATA_PATH}/` + name,
    success(res) {
      console.log(res)
      if (successCall != undefined) successCall()
    }, fail(res) {
      console.log(res.errMsg)
      if (copyfail != undefined) copyfail()
    }
  })
}

export const readDirHandler = (successCall: Function, readfail?: Function) => {
  var fs = wx.getFileSystemManager()
  fs.readdir({
    dirPath: `${wx.env.USER_DATA_PATH}`,
    success(res) {
      successCall(res.files)
    },
    fail(err) {
      console.log('fail', err.errMsg)
      if (readfail != undefined) readfail()
    }
  })
}

export const readSLBFileHandle = (file: string, successCall: Function) => {
  readFileDetail(file, 'hex', successCall)
}

export const readSBHFileHandle = (file: string, successCall: Function) => {
  readFileDetail(file, 'utf8', successCall)
}

const readFileDetail = (file: string, encoding: any, successCall: Function) => {
  var fs = wx.getFileSystemManager()
  fs.readFile({
    filePath: `${wx.env.USER_DATA_PATH}/` + file,
    encoding, //hex16要用utf8,bin要用hex
    position: 0,
    success(res) {
      successCall(res.data)
    },
    fail(res) {
      console.log(res.errMsg)
    }
  })
}