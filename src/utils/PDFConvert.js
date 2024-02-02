import * as pdfjsDist from 'pdfjs-dist';
import * as pdfWorkerMin from 'pdfjs-dist/build/pdf.worker.min?url';

function fileToBinary(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = () => {
        const arrayBuffer = reader.result;
        resolve(arrayBuffer);
      };
  
      reader.onerror = reject;
  
      reader.readAsArrayBuffer(file);
    });
  }

function mergeSameLine(items) {
    const toLine = (item) => {
        const line = {
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
function isIntersect(A, B) {
    if (B.right < A.left ||
        B.left > A.right ||
        B.bottom > A.top ||
        B.top < A.bottom) {
        return false
    } else {
        return true
    }
}

function isIntersectLines(lineA, lineB, maxWidth, maxHeight) {
    const rectA = {
        left: lineA.x / maxWidth,
        right: (lineA.x + lineA.width) / maxWidth,
        bottom: lineA.y / maxHeight,
        top: (lineA.y + lineA.height) / maxHeight
    }
    const rectB = {
        left: lineB.x / maxWidth,
        right: (lineB.x + lineB.width) / maxWidth,
        bottom: lineB.y / maxHeight,
        top: (lineB.y + lineB.height) / maxHeight
    }
    return isIntersect(rectA, rectB)
}

export async function ReadPDF(PDFFile){
    const PDFArrayBuffer = await fileToBinary(PDFFile)
    pdfjsDist.GlobalWorkerOptions.workerSrc = pdfWorkerMin.default
    const loadingTask = pdfjsDist.getDocument({data: PDFArrayBuffer});
    const pdfDoc = await loadingTask.promise;
    let pages = []
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        pages.push(page)
    };
    let pageLines = {}
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const textContent = await page.getTextContent();
        //排除空行
        const items = textContent.items.filter((item) => item.str.trim().length)
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
            const maxWidth = page._pageInfo.view[2]
            const maxHeight = page._pageInfo.view[3]
            let lines = [...pageLines[pageNum]]
            const removeLines = new Set()
            const removeNumber = (text) => {
                // 英文页码
                if (/^[A-Z]{1,3}$/.test(text)) {
                    text = ""
                }
                // 正常页码1,2,3
                text = text.replace(/\x20+/g, "").replace(/\d+/g, "")
                return text
            }
            const isRepeat = (line, _line) => {
                const text = removeNumber(line.text)
                const _text = removeNumber(_line.text)
                return text == _text && isIntersectLines(line, _line, maxWidth, maxHeight)
            }
            for (let i of Object.keys(pageLines)) {
                if (Number(i) == pageNum) {
                    continue
                }
                const _lines = pageLines[i]
                const directions = {
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
                    ["forward", "backward"].forEach((direction) => {
                        if (directions[direction].done) {
                            return
                        }
                        const factor = directions[direction].factor
                        const index = factor * offset + (factor > 0 ? 0 : -1)
                        const line = lines.slice(index)[0]
                        const _line = _lines.slice(index)[0]
                        if (isRepeat(line, _line)) {
                            line[direction] = true
                            removeLines.add(line)
                        } else {
                            directions[direction].done = true
                        }

                    })
                }
                const content = { x: 0.2 * maxWidth, width: .6 * maxWidth, y: .2 * maxHeight, height: .6 * maxHeight }
                for (let j = 0; j < lines.length; j++) {
                    let line = lines[j]
                    if (isIntersectLines(content, line, maxWidth, maxHeight)) { continue }
                    for (let k = 0; k < _lines.length; k++) {
                        let _line = _lines[k]
                        if (isRepeat(line, _line)) {
                            line.repeat = line.repeat == undefined ? 1 : (line.repeat + 1)
                            line.repateWith = _line
                            removeLines.add(line)
                        }
                    }
                }
            }
            lines = lines.filter((e) => !(e.forward || e.backward || (e.repeat && e.repeat > 3)));

            let abs = (x) => x > 0 ? x : -x
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
                paragraphsTextList.push( _pageText)

            }
        }
        return paragraphsTextList
}