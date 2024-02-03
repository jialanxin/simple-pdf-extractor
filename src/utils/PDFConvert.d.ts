
interface HasArrayBuffer{
    arrayBuffer: (()=>Promise<ArrayBufffer>) | (() => ArrayBuffer)
}
declare type ReadPDF = (HasArrayBuffer)=>String[]

export const ReadPDF:ReadPDF