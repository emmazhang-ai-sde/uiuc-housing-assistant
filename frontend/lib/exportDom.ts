function inlineComputedStyles(source: Element, target: Element) {
  const computed = window.getComputedStyle(source)
  const targetElement = target as HTMLElement

  for (const property of computed) {
    targetElement.style.setProperty(
      property,
      computed.getPropertyValue(property),
      computed.getPropertyPriority(property)
    )
  }

  Array.from(source.children).forEach((sourceChild, index) => {
    const targetChild = target.children[index]
    if (targetChild) inlineComputedStyles(sourceChild, targetChild)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function elementToPngBlob(element: HTMLElement, scale = 2): Promise<Blob> {
  await document.fonts.ready

  const rect = element.getBoundingClientRect()
  const width = Math.ceil(rect.width)
  const height = Math.ceil(rect.height)
  const clone = element.cloneNode(true) as HTMLElement

  inlineComputedStyles(element, clone)
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml")
  clone.style.width = `${width}px`
  clone.style.height = `${height}px`
  clone.style.margin = "0"

  const serialized = new XMLSerializer().serializeToString(clone)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject width="100%" height="100%">
        ${serialized}
      </foreignObject>
    </svg>
  `
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  const canvas = document.createElement("canvas")
  canvas.width = width * scale
  canvas.height = height * scale

  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas is not available.")

  context.scale(scale, scale)
  context.drawImage(image, 0, 0)

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error("Could not create PNG."))
    }, "image/png")
  })
}

export async function downloadElementPng(element: HTMLElement, filename: string) {
  const blob = await elementToPngBlob(element)
  downloadBlob(blob, filename)
}
