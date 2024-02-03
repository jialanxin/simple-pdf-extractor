import * as pdfjsDist from 'pdfjs-dist';
import * as pdfWorkerMin from 'pdfjs-dist/build/pdf.worker.min?url';
import { TextItem } from 'pdfjs-dist/types/src/display/api';

interface Box {
    x: number
    y: number
    height: number
    width: number
}

interface Line extends Box, DirectionForLines {
    text: string
    repeat?: number
    repeatWith?: Line
}


function mergeSameLine(items: TextItem[]) {
    const toLine = (item: TextItem) => {
        const line: Line = {
            x: parseFloat(item.transform[4].toFixed(1)),
            y: parseFloat(item.transform[5].toFixed(1)),
            text: item.str || "",
            height: item.height,
            width: item.width,
        }
        if (line.width < 0) {
            line.x = line.x + line.width
            line.width = -line.width
        }
        return line
    }
    let j = 0;
    let lines = [toLine(items[j])]
    for (let j = 1; j < items.length; j++) {
        const line = toLine(items[j])
        const lastLine = lines.slice(-1)[0]

        if (line.y == lastLine.y || (line.y >= lastLine.y && line.y < lastLine.y + lastLine.height) || (line.y + line.height > lastLine.y && line.y + line.height <= lastLine.y + lastLine.height)) {
            lastLine.text += (" " + line.text)
            lastLine.width += line.width
        } else {
            lines.push(line)
        }
    }
    return lines
}
function isIntersect(A: Rect, B: Rect) {
    if (B.right < A.left ||
        B.left > A.right ||
        B.bottom > A.top ||
        B.top < A.bottom) {
        return false
    } else {
        return true
    }
}
interface Rect {
    left: number,
    right: number,
    bottom: number,
    top: number
}

function isIntersectLines(lineA: Box, lineB: Box, maxWidth: number, maxHeight: number) {
    const rectA: Rect = {
        left: lineA.x / maxWidth,
        right: (lineA.x + lineA.width) / maxWidth,
        bottom: lineA.y / maxHeight,
        top: (lineA.y + lineA.height) / maxHeight
    }
    const rectB: Rect = {
        left: lineB.x / maxWidth,
        right: (lineB.x + lineB.width) / maxWidth,
        bottom: lineB.y / maxHeight,
        top: (lineB.y + lineB.height) / maxHeight
    }
    return isIntersect(rectA, rectB)
}

interface hasArrayBuffer {
    arrayBuffer: () => Promise<ArrayBuffer> | ArrayBuffer
}
interface pageLines {
    [index: number]: Line[]
}
interface directionProperties {
    factor: number,
    done: boolean
}
type direction = "forward" | "backward"
type Directions = Record<direction, directionProperties>
type DirectionForLines = Partial<Record<direction, boolean>>

export async function ReadPDF(PDFFile: hasArrayBuffer) :Promise<String[]>{
    const PDFArrayBuffer = await PDFFile.arrayBuffer()
    pdfjsDist.GlobalWorkerOptions.workerSrc = pdfWorkerMin.default
    const loadingTask = pdfjsDist.getDocument({ data: PDFArrayBuffer });
    const pdfDoc = await loadingTask.promise;
    let pages = []
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        pages.push(page)
    };
    let pageLines: pageLines = {}
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const textContent = await page.getTextContent();
        //排除空行
        const items_with_str_properties = textContent.items.filter((item) => item.hasOwnProperty("str")) as TextItem[]
        const items = items_with_str_properties.filter((item) => item.str.trim().length)
        let lines = mergeSameLine(items)
        const index = lines.findIndex(line => /(r?eferences?|acknowledgements)$/i.test(line.text.trim()))
        if (index != -1) {
            lines = lines.slice(0, index)
            break
        }
        pageLines[i] = lines
    }
    const totalPageNum = Object.keys(pageLines).length
    const paragraphsTextList = []
    for (let pageNum = 0; pageNum < totalPageNum; pageNum++) {
        const page = pages[pageNum]
        const maxWidth = page._pageInfo.view[2] as number
        const maxHeight = page._pageInfo.view[3] as number
        let lines = [...pageLines[pageNum]]
        const removeLines = new Set()
        const removeNumber = (text: string) => {
            // 英文页码
            if (/^[A-Z]{1,3}$/.test(text)) {
                text = ""
            }
            // 正常页码1,2,3
            text = text.replace(/\x20+/g, "").replace(/\d+/g, "")
            return text
        }
        const isRepeat = (line: Line, _line: Line) => {
            const text = removeNumber(line.text)
            const _text = removeNumber(_line.text)
            return text == _text && isIntersectLines(line, _line, maxWidth, maxHeight)
        }
        for (let i of Object.keys(pageLines)) {
            if (Number(i) == pageNum) {
                continue
            }
            const _lines = pageLines[Number(i)]
            const directions: Directions = {
                forward: {
                    factor: 1,
                    done: false
                },
                backward: {
                    factor: -1,
                    done: false
                }
            }
            for (let offset = 0; offset < lines.length && offset < _lines.length; offset++) {
                let key: (keyof Directions)
                for (key in directions) {
                    if (directions[key].done) {
                        continue
                    }
                    const factor = directions[key].factor
                    const index = factor * offset + (factor > 0 ? 0 : -1)
                    const line = lines.slice(index)[0]
                    const _line = _lines.slice(index)[0]
                    if (isRepeat(line, _line)) {
                        line[key] = true
                        removeLines.add(line)
                    } else {
                        directions[key].done = true
                    }
                }
            }
            const content = { x: 0.2 * maxWidth, width: .6 * maxWidth, y: .2 * maxHeight, height: .6 * maxHeight }
            for (let j = 0; j < lines.length; j++) {
                let line = lines[j]
                if (isIntersectLines(content, line, maxWidth, maxHeight)) { continue }
                for (let k = 0; k < _lines.length; k++) {
                    let _line = _lines[k]
                    if (isRepeat(line, _line)) {
                        line.repeat = line.repeat == undefined ? 1 : (line.repeat + 1)
                        line.repeatWith = _line
                        removeLines.add(line)
                    }
                }
            }
        }
        lines = lines.filter((e) => !(e.forward || e.backward || (e.repeat && e.repeat > 3)));

        let abs = (x: number) => x > 0 ? x : -x
        const paragraphs = [[lines[0]]]
        for (let i = 1; i < lines.length; i++) {
            let lastLine = paragraphs.slice(-1)[0].slice(-1)[0]
            let currentLine = lines[i]
            let nextLine = lines[i + 1]
            const isNewParagraph =
                // 达到一定行数阈值
                paragraphs.slice(-1)[0].length >= 5 &&
                (
                    // 是摘要自动为一段
                    /abstract/i.test(currentLine.text) ||
                    // 与上一行间距过大
                    abs(lastLine.y - currentLine.y) > currentLine.height * 2 ||
                    // 首行缩进分段
                    (currentLine.x > lastLine.x && nextLine && nextLine.x < currentLine.x)
                )
            // 开新段落
            if (isNewParagraph) {
                paragraphs.push([currentLine])
            }
            // 否则纳入当前段落
            else {
                paragraphs.slice(-1)[0].push(currentLine)
            }
        }

        for (let i = 0; i < paragraphs.length; i++) {
            let box
            let _pageText = ""
            let line, nextLine
            for (let j = 0; j < paragraphs[i].length; j++) {
                line = paragraphs[i][j]
                if (!line) { continue }
                nextLine = paragraphs[i]?.[j + 1]
                // 更新边界
                box = { page: pageNum, left: line.x, right: line.x + line.width, top: line.y + line.height, bottom: line.y }
                if (line.x < box.left) {
                    box.left = line.x
                }
                if (line.x + line.width > box.right) {
                    box.right = line.x + line.width
                }
                if (line.y < box.bottom) {
                    line.y = box.bottom
                }
                if (line.y + line.height > box.top) {
                    box.top = line.y + line.height
                }
                _pageText += line.text
                if (
                    nextLine &&
                    line.height > nextLine.height
                ) {
                    _pageText = "\n"
                } else if (j < paragraphs[i].length - 1) {
                    if (!line.text.endsWith("-")) {
                        _pageText += " "
                    }
                }
            }
            _pageText = _pageText.replace(/\x20+/g, " ").replace(/^\x20*\n+/g, "").replace(/\x20*\n+/g, "");
            paragraphsTextList.push(_pageText)

        }
    }
    return paragraphsTextList
}