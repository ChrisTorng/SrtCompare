import fs from 'fs';
import levenshtein from 'fastest-levenshtein';
import chalk from 'chalk';

const maxLength = 100;
const maxOffset = 5;
const leastDistance = 0.5;

// 讀取 SRT 檔案並返回所有字幕的文字部分，保留次序
function readSRT(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const texts: string[] = [];

  let isText = false;
  for (const line of lines) {
    if (isText) {
      if (line.trim() === '') {
        isText = false;
      } else {
        texts.push(line.trim());
      }
    } else {
      if (/-->/.test(line)) {
        isText = true;
      }
    }
  }

  return texts;
}

// 使用最長公共子序列算法來找出差異並進行色彩標示
function highlightDifferences(str1: string, str2: string) {
  let dp = Array(str1.length + 1).fill(0).map(() => Array(str2.length + 1).fill(0));

  // 填充 DP 表
  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = str1.length;
  let j = str2.length;
  let highlighted1 = '';
  let highlighted2 = '';

  // 回溯 DP 表以找出最長公共子序列，並進行色彩標示
  while (i > 0 && j > 0) {
    if (str1[i - 1] === str2[j - 1]) {
      highlighted1 = str1[i - 1] + highlighted1;
      highlighted2 = str2[j - 1] + highlighted2;
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      highlighted1 = chalk.red(str1[i - 1]) + highlighted1;
      i--;
    } else {
      highlighted2 = chalk.green(str2[j - 1]) + highlighted2;
      j--;
    }
  }

  // 處理剩餘的字符
  while (i > 0) {
    highlighted1 = chalk.red(str1[i - 1]) + highlighted1;
    i--;
  }
  while (j > 0) {
    highlighted2 = chalk.green(str2[j - 1]) + highlighted2;
    j--;
  }

  return [highlighted1, highlighted2];
}

// 比較兩個字幕陣列，並輸出差異
function compareAndPrintDifferences(srt1: string[], srt2: string[]): void {
  let i = 0;
  let j = 0;

  while (i < srt1.length && i < maxLength && j < srt2.length && j < maxLength) {
    const distance = levenshtein.distance(srt1[i], srt2[j]);
    const lengthAvg = (srt1[i].length + srt2[j].length) / 2;
    
    if (distance / lengthAvg < leastDistance) {
      i++;
      j++;
      continue;
    }

    let found = false;
    for (let offset1 = 0; offset1 < maxOffset && i + offset1 < srt1.length; offset1++) {
      for (let offset2 = 0; offset2 < maxOffset && j + offset2 < srt2.length; offset2++) {
        
        if (offset1 > 0 || offset2 > 0) {
          const [similarLast, textLast] = compareLines(i + offset1, 0, j + offset2, 0, srt1[i + offset1], srt2[j + offset2]);
          if (similarLast) {
            const combined1 = srt1.slice(i, i + offset1).join(' ');
            const combined2 = srt2.slice(j, j + offset2).join(' ');
            console.log('betweenLast', getDifferences(i,  offset1 - 1, j, offset2 - 1, combined1, combined2));
    
            if (textLast !== '') {
              console.log(`similarLast ${textLast}`);
            }
            found = true;
            i += offset1 + 1;
            j += offset2 + 1;
            break;
          }
        }

        const combined1 = srt1.slice(i, i + offset1 + 1).join(' ');
        const combined2 = srt2.slice(j, j + offset2 + 1).join(' ');
        const [similarCombined, textCombined] = compareLines(i, offset1, j, offset2, combined1, combined2);
        if (similarCombined) {
          if (textCombined !== '') {
            const reason = offset1 === 0 && offset2 === 0 ? 'oneLine' : 'combined';
            console.log(reason, textCombined);
          }
          found = true;
          i += offset1 + 1;
          j += offset2 + 1;
          break;
        }
      }

      if (found) break;
    }

    if (!found) {
      console.log('not found', getDifferences(i, 0, j, 0, srt1[i], srt2[j]));
      i++;
      j++;
    }
  }
}

function compareLines(i: number, offset1: number,
    j: number, offset2: number,
    line1: string, line2: string): [boolean, string] {
  const newDistance = levenshtein.distance(line1, line2);
  const newLengthAvg = (line1.length + line2.length) / 2;

  // console.log(`[${i+1}+${offset1}]${line1} <=> [${j+1}+${offset2}]${line2}: ${newDistance}/${newLengthAvg}=${newDistance / newLengthAvg}}`);
  if (newDistance / newLengthAvg < leastDistance) {
    if (newDistance !== 0) {
      const text = getDifferences(i, offset1, j, offset2, line1, line2);
      return [ true, text];
    }

    return [true, ''];
  }
  return [false, ''];
}

function getDifferences(i: number, offset1: number,
    j: number, offset2: number,
    str1: string, str2: string): string {
  const [marked1, marked2] = highlightDifferences(str1, str2);
  return `[${i + 1}${offset1 !== 0 ? `-${i + offset1 + 1}` : ''}] ${marked1}\t[${j + 1}${offset2 !== 0 ? `-${j + offset2 + 1}` : ''}] ${marked2}`;
}

// 主函式
function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.log("請提供兩個 SRT 檔案的路徑。");
    return;
  }

  const [filePath1, filePath2] = args;
  if (!fs.existsSync(filePath1) || !fs.existsSync(filePath2)) {
    console.log("一個或多個指定的檔案不存在。");
    return;
  }

  const srt1 = readSRT(filePath1);
  const srt2 = readSRT(filePath2);

  compareAndPrintDifferences(srt1, srt2);
}

main();
