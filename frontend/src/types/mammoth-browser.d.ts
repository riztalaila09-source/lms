// Prebuilt browser bundle mammoth/mammoth.browser tidak membawa deklarasi tipe.
// Minimal typing untuk yang kita pakai (convertToHtml + images.imgElement).
declare module 'mammoth/mammoth.browser' {
  interface ConvertResult { value: string; messages: { message: string }[] }
  interface ConvertOptions { convertImage?: unknown; styleMap?: string | string[] }
  interface ImageElementInfo { read: (encoding?: string) => Promise<string> }
  const mammoth: {
    convertToHtml(input: { arrayBuffer: ArrayBuffer }, options?: ConvertOptions): Promise<ConvertResult>
    images: {
      imgElement(fn: (image: ImageElementInfo) => Promise<{ src: string }>): unknown
    }
  }
  export default mammoth
}
