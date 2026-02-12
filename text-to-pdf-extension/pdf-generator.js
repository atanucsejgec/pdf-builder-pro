// pdf-generator.js
export function generatePDFAsync(segments, config, statusDiv, progressBar) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: config.orientation,
        unit: 'pt',
        format: config.paperSize
      });
      
      const cmToPt = 28.35;
      const marginTop = config.margins.top * cmToPt;
      const marginBottom = config.margins.bottom * cmToPt;
      const marginLeft = config.margins.left * cmToPt;
      const marginRight = config.margins.right * cmToPt;
      
      const fullPageWidth = doc.internal.pageSize.getWidth();
      const fullPageHeight = doc.internal.pageSize.getHeight();
      const contentWidth = fullPageWidth - marginLeft - marginRight;
      
      const columns = Math.max(1, config.columnCount);
      const colGap = 15; 
      const colWidth = (contentWidth - ((columns - 1) * colGap)) / columns;
      
      let currentCol = 0; 
  
      const paintBackground = () => {
          if (config.bgColor && config.bgColor.toLowerCase() !== '#ffffff') {
              doc.setFillColor(config.bgColor);
              doc.rect(0, 0, fullPageWidth, fullPageHeight, 'F');
          }
      };
  
      paintBackground();
  
      const getColX = () => marginLeft + (currentCol * (colWidth + colGap));
  
      let cursorX = getColX();
      let cursorY = marginTop + config.fontSize; 
      const baseLineHeightMultiplier = config.lineHeightMultiplier; 
  
      doc.setFontSize(config.fontSize);
      doc.setTextColor(config.textColor);
  
      let isAtStartOfLine = true;
      let pageNumber = 1;
  
      const allocateSpace = (neededHeight) => {
          if (cursorY + neededHeight <= fullPageHeight - marginBottom) return false;
          currentCol++;
          if (currentCol >= columns) {
              if (config.showPageNumbers) {
                  doc.setFontSize(10);
                  doc.setFont(config.fontStyle, "normal");
                  doc.setTextColor(config.textColor);
                  doc.text(String(pageNumber), fullPageWidth / 2, fullPageHeight - 15, { align: 'center' });
              }
              doc.addPage();
              paintBackground(); 
              pageNumber++;
              currentCol = 0;
          }
          cursorX = getColX();
          cursorY = marginTop + config.fontSize; 
          isAtStartOfLine = true;
          return true; 
      };
  
      const emojiRegex = /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g;
      const makeSafeText = (txt) => txt.replace(/[^\x00-\xFF\u0152\u0153\u0178\u0192\u20AC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u02C6\u203E\u02DC\u2122\u2190-\u21FF\u2200-\u22FF\u0391-\u03C9\s]/g, '');
  
      let currentIndex = 0;
      const totalSegments = segments.length;
      const CHUNK_SIZE = 50;
      
      let currentLineMaxHeight = config.fontSize * baseLineHeightMultiplier;
      let prevSegmentEndedWithSpace = true;
  
      function processChunk() {
          const chunkEnd = Math.min(currentIndex + CHUNK_SIZE, totalSegments);
          
          for (let i = currentIndex; i < chunkEnd; i++) {
              const seg = segments[i];
  
              let applyFontSize = config.fontSize; 
              if (seg.type === 'text') {
                  if (config.fontMode === 'original') applyFontSize = seg.fontSize || 12;
                  else if (config.fontMode === 'relative') applyFontSize = (seg.fontSize || 12) + config.fontScale;
                  if (applyFontSize < 6) applyFontSize = 6; if (applyFontSize > 72) applyFontSize = 72;
              }
  
              if (seg.type === 'image') {
                  let imgW = seg.width * 0.75; 
                  let imgH = seg.height * 0.75;
  
                  if (seg.isInline) {
                      let maxInlineHeight = applyFontSize * 1.5;
                      if (imgH > maxInlineHeight) {
                          let ratio = maxInlineHeight / imgH;
                          imgH *= ratio;
                          imgW *= ratio;
                      }
                      if (cursorX + imgW > getColX() + colWidth) {
                          cursorX = getColX(); cursorY += currentLineMaxHeight; isAtStartOfLine = true;
                      }
                      allocateSpace(imgH);
                      doc.addImage(seg.src, 'PNG', cursorX, cursorY - (imgH * 0.8), imgW, imgH);
                      cursorX += imgW + (applyFontSize * 0.2); 
                      isAtStartOfLine = false;
                      if (imgH > currentLineMaxHeight) currentLineMaxHeight = imgH;
                      prevSegmentEndedWithSpace = false;
                  } else {
                      if (!isAtStartOfLine) {
                          cursorY += currentLineMaxHeight + 5; isAtStartOfLine = true;
                      }
                      if (imgW > colWidth) {
                          const ratio = colWidth / imgW;
                          imgW = colWidth;
                          imgH = imgH * ratio;
                      }
                      allocateSpace(imgH + 10);
                      doc.addImage(seg.src, 'PNG', cursorX, cursorY, imgW, imgH);
                      cursorY += imgH + 10;
                      currentLineMaxHeight = config.fontSize * baseLineHeightMultiplier;
                      prevSegmentEndedWithSpace = true;
                  }
              }
              // --- DYNAMIC CODE BLOCK SPLITTING ---
              else if (seg.type === 'code') {
                  if (!isAtStartOfLine) {
                      cursorY += currentLineMaxHeight + 5; 
                      isAtStartOfLine = true;
                  }
                  
                  doc.setFont("courier", "normal");
                  const codeFontSize = Math.max(6, config.fontSize - 2); 
                  doc.setFontSize(codeFontSize); 
                  const codeLineHeight = codeFontSize * 1.15; 
                  const codeLines = doc.splitTextToSize(makeSafeText(seg.text), colWidth - 10);
                  
                  // Make sure at least one line fits before we start drawing
                  if (cursorY + codeLineHeight > fullPageHeight - marginBottom) {
                      allocateSpace(fullPageHeight); 
                  }

                  let startY = cursorY; 
                  let linesToDraw = [];
                  let currentBoxStartY = cursorY - codeFontSize - 4; // 4pt top padding
                  
                  for (let j = 0; j < codeLines.length; j++) {
                      // Check if adding the next line pushes us past the bottom margin
                      if (cursorY + codeLineHeight > fullPageHeight - marginBottom) {
                          // Draw what we've accumulated so far on the current page
                          if (linesToDraw.length > 0) {
                              let boxHeight = 4 + ((linesToDraw.length - 1) * codeLineHeight) + codeFontSize + 6; 
                              doc.setFillColor(245, 245, 245);
                              doc.rect(cursorX, currentBoxStartY, colWidth, boxHeight, 'F');
                              doc.setTextColor(0, 0, 0);
                              doc.text(linesToDraw, cursorX + 5, startY);
                          }
                          
                          // Force a new column/page
                          allocateSpace(fullPageHeight); 
                          
                          // Reset trackers for the newly created page
                          startY = cursorY + 4; // Slight push down on new page
                          currentBoxStartY = startY - codeFontSize - 4;
                          cursorY = startY; 
                          linesToDraw = [];
                      }
                      
                      linesToDraw.push(codeLines[j]);
                      cursorY += codeLineHeight;
                  }
                  
                  // Draw whatever is left of the code block
                  if (linesToDraw.length > 0) {
                      let boxHeight = 4 + ((linesToDraw.length - 1) * codeLineHeight) + codeFontSize + 6; 
                      doc.setFillColor(245, 245, 245);
                      doc.rect(cursorX, currentBoxStartY, colWidth, boxHeight, 'F');
                      doc.setTextColor(0, 0, 0);
                      doc.text(linesToDraw, cursorX + 5, startY);
                      
                      // Move cursor precisely to the bottom of the drawn box
                      cursorY = currentBoxStartY + boxHeight; 
                  }
                  
                  cursorY += 15; // Bottom spacing after code block
                  doc.setFont(config.fontStyle, "normal");
                  doc.setFontSize(config.fontSize);
                  doc.setTextColor(config.textColor);
                  currentLineMaxHeight = config.fontSize * baseLineHeightMultiplier;
                  prevSegmentEndedWithSpace = true;
              }
              else if (seg.type === 'table') {
                  if (!isAtStartOfLine) {
                      cursorY += currentLineMaxHeight;
                      currentLineMaxHeight = config.fontSize * baseLineHeightMultiplier;
                      isAtStartOfLine = true;
                  }
                  const rows = seg.rows;
                  const colCount = seg.maxCols;
                  if (colCount > 0) {
                      cursorY += 5;
                      cursorX = getColX(); 
                      const cellWidth = colWidth / colCount;
                      const cellPadding = 4;
                      doc.setFont(config.fontStyle, "normal"); 
                      doc.setFontSize(config.fontSize); 
                      doc.setTextColor(config.textColor);
                      doc.setLineWidth(0.5);
                      const tableLineHeight = config.fontSize * baseLineHeightMultiplier;
  
                      rows.forEach(row => {
                          let maxCellHeight = 0;
                          const cellLinesArr = []; 
                          row.forEach(cellText => {
                              const cleanText = makeSafeText(cellText); 
                              const lines = doc.splitTextToSize(cleanText, cellWidth - (cellPadding * 2));
                              cellLinesArr.push(lines);
                              const cellHeight = (lines.length * tableLineHeight) + (cellPadding * 2);
                              if (cellHeight > maxCellHeight) maxCellHeight = cellHeight;
                          });
                          if (maxCellHeight < config.fontSize + cellPadding * 2) maxCellHeight = config.fontSize + cellPadding * 2;
                          allocateSpace(maxCellHeight);
                          let currentCellX = cursorX; 
                          row.forEach((cellText, idx) => {
                              doc.rect(currentCellX, cursorY, cellWidth, maxCellHeight);
                              const lines = cellLinesArr[idx];
                              if (lines) doc.text(lines, currentCellX + cellPadding, cursorY + config.fontSize + cellPadding);
                              currentCellX += cellWidth;
                          });
                          cursorY += maxCellHeight;
                      });
                      cursorY += 10;
                      isAtStartOfLine = true;
                      currentLineMaxHeight = config.fontSize * baseLineHeightMultiplier;
                      prevSegmentEndedWithSpace = true;
                  }
              }
              else if (seg.type === 'text') {
                  if (seg.newline) {
                      if (!isAtStartOfLine) {
                          cursorX = getColX(); cursorY += currentLineMaxHeight;
                          isAtStartOfLine = true; currentLineMaxHeight = 0; 
                      }
                      prevSegmentEndedWithSpace = true;
                  } else {
                      let drawYOffset = 0;
                      if (seg.sub) { applyFontSize = applyFontSize * 0.65; drawYOffset = applyFontSize * 0.4; } 
                      else if (seg.sup) { applyFontSize = applyFontSize * 0.65; drawYOffset = -(applyFontSize * 0.4); }
  
                      doc.setFontSize(applyFontSize);
                      doc.setTextColor(config.textColor); 
                      let fontType = "normal";
                      if (seg.bold && seg.italic) fontType = "bolditalic";
                      else if (seg.bold) fontType = "bold";
                      else if (seg.italic) fontType = "italic";
                      doc.setFont(config.fontStyle, fontType);
  
                      const words = seg.text.split(" ").filter(w => w.length > 0); 
                      const segLineHeight = applyFontSize * baseLineHeightMultiplier;
                      if (segLineHeight > currentLineMaxHeight && !seg.sub && !seg.sup) currentLineMaxHeight = segLineHeight;
                      if (currentLineMaxHeight === 0) currentLineMaxHeight = segLineHeight;
  
                      words.forEach((word, index) => {
                          const parts = word.split(emojiRegex).filter(Boolean);
                          parts.forEach((part, pIndex) => {
                              const isEmoji = !!part.match(emojiRegex);
                              let textToDraw = part;
                              let needsSpace = false;
  
                              if (!isAtStartOfLine) {
                                  if (index === 0 && pIndex === 0) {
                                      if (seg.startsWithSpace || prevSegmentEndedWithSpace) needsSpace = true;
                                  } else if (pIndex === 0) {
                                      needsSpace = true;
                                  }
                              }
  
                              if (needsSpace) textToDraw = " " + textToDraw;
  
                              if (isEmoji) {
                                  const spaceWidth = textToDraw.startsWith(" ") ? doc.getTextWidth(" ") : 0;
                                  const emojiWidth = applyFontSize; 
                                  const totalWidth = spaceWidth + emojiWidth;
  
                                  if (cursorX + totalWidth > getColX() + colWidth) {
                                      cursorX = getColX(); cursorY += currentLineMaxHeight; 
                                      textToDraw = textToDraw.trimStart(); isAtStartOfLine = true;
                                  }
                                  allocateSpace(currentLineMaxHeight);
                                  if (textToDraw.startsWith(" ")) cursorX += spaceWidth;
  
                                  try {
                                      const canvas = document.createElement('canvas');
                                      canvas.width = applyFontSize * 2; canvas.height = applyFontSize * 2;
                                      const ctx = canvas.getContext('2d');
                                      ctx.font = `${applyFontSize * 1.5}px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`;
                                      ctx.textBaseline = 'top';
                                      ctx.fillText(part, 0, 0); 
                                      doc.addImage(canvas.toDataURL('image/png'), 'PNG', cursorX, (cursorY + drawYOffset) - (applyFontSize * 0.8), applyFontSize, applyFontSize);
                                  } catch(e) { }
                                  cursorX += emojiWidth;
                                  isAtStartOfLine = false;
                              } else {
                                  textToDraw = makeSafeText(textToDraw);
                                  if (textToDraw.length === 0) return;
                                  let textWidth = doc.getTextWidth(textToDraw);
  
                                  if (cursorX + textWidth > getColX() + colWidth) {
                                      cursorX = getColX(); cursorY += currentLineMaxHeight; 
                                      textToDraw = textToDraw.trimStart(); textWidth = doc.getTextWidth(textToDraw);
                                      isAtStartOfLine = true; currentLineMaxHeight = segLineHeight;
                                  }
                                  if (allocateSpace(currentLineMaxHeight)) {
                                      doc.setFontSize(applyFontSize); doc.setFont(config.fontStyle, fontType); 
                                  }
                                  doc.text(textToDraw, cursorX, cursorY + drawYOffset);
                                  isAtStartOfLine = false; 
                                  if (seg.underline && !seg.sub && !seg.sup) {
                                      doc.setLineWidth(applyFontSize / 20);
                                      doc.line(cursorX, cursorY + 1, cursorX + textWidth, cursorY + 1);
                                  }
                                  cursorX += textWidth;
                              }
                          });
                      });
                      prevSegmentEndedWithSpace = seg.endsWithSpace;
                  }
              }
          }
          
          currentIndex = chunkEnd;
          const pct = Math.round((currentIndex / totalSegments) * 100);
          progressBar.style.width = (30 + (pct * 0.7)) + "%";
  
          if (currentIndex < totalSegments) {
              setTimeout(processChunk, 0);
          } else {
              if (config.showPageNumbers) {
                  doc.setFontSize(10); doc.setFont(config.fontStyle, "normal"); doc.setTextColor(config.textColor);
                  doc.text(String(pageNumber), fullPageWidth / 2, fullPageHeight - 15, { align: 'center' });
              }
              doc.save(config.filename + ".pdf");
              statusDiv.textContent = "Done!";
              progressBar.style.width = "100%";
              setTimeout(() => { document.getElementById("progress-container").style.display = "none"; }, 2000);
          }
      }
      processChunk();
    } catch (err) {
      console.error(err);
      statusDiv.textContent = "PDF Error: " + err.message;
    }
  }