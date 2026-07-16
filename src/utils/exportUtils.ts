import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, TableRow, TableCell, Table, WidthType, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';
import type { MeetingRecord, TodoItem, SpeechSegment } from '../plugin/types';

/** 将纪要文本转为 Markdown 格式 */
export function toMarkdown(record: MeetingRecord): string {
  const lines: string[] = [];

  lines.push(`# ${record.title || '会议纪要'}`);
  lines.push('');
  if (record.description) {
    lines.push(`> ${record.description}`);
    lines.push('');
  }
  lines.push(`📅 时间：${new Date(record.createdAt).toLocaleString('zh-CN')}`);
  lines.push('');

  // 会议纪要正文
  if (record.summary) {
    lines.push('---');
    lines.push('');
    lines.push('## 会议纪要');
    lines.push('');
    lines.push(record.summary);
    lines.push('');
  }

  // 发言记录
  if (record.segments.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## 发言记录');
    lines.push('');
    for (const seg of record.segments) {
      lines.push(`**${seg.speakerName || '未知'}**（${seg.time}）：${seg.original}`);
      lines.push('');
    }
  }

  // 待办事项
  if (record.todos.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## 待办事项');
    lines.push('');
    lines.push('| 事项 | 负责人 | 截止日期 | 优先级 | 状态 |');
    lines.push('|------|--------|----------|--------|------|');
    for (const todo of record.todos) {
      lines.push(`| ${todo.title} | ${todo.owner} | ${todo.dueDate} | ${todo.priority} | ${todo.status} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** 复制 Markdown 到剪贴板 */
export async function copyAsMarkdown(record: MeetingRecord): Promise<void> {
  const md = toMarkdown(record);
  await navigator.clipboard.writeText(md);
}

/** 导出为 Word 文档 (.docx) */
export async function exportAsWord(record: MeetingRecord): Promise<void> {
  const children: Paragraph[] = [];

  // 标题
  children.push(new Paragraph({
    text: record.title || '会议纪要',
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));

  // 时间
  children.push(new Paragraph({
    children: [new TextRun({ text: `时间：${new Date(record.createdAt).toLocaleString('zh-CN')}`, color: '666666', size: 20 })],
    spacing: { after: 300 },
  }));

  // 会议纪要正文
  if (record.summary) {
    children.push(new Paragraph({
      text: '会议纪要',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 100 },
    }));
    // 按换行拆分段落
    const summaryLines = record.summary.split('\n').filter(l => l.trim());
    for (const line of summaryLines) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, size: 22 })],
        spacing: { after: 80 },
      }));
    }
  }

  // 发言记录
  if (record.segments.length > 0) {
    children.push(new Paragraph({
      text: '发言记录',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 },
    }));
    for (const seg of record.segments) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${seg.speakerName || '未知'}`, bold: true, size: 22 }),
          new TextRun({ text: `（${seg.time}）：`, color: '666666', size: 20 }),
          new TextRun({ text: seg.original, size: 22 }),
        ],
        spacing: { after: 100 },
      }));
    }
  }

  // 待办事项表格
  if (record.todos.length > 0) {
    children.push(new Paragraph({
      text: '待办事项',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 },
    }));

    const headerRow = new TableRow({
      children: ['事项', '负责人', '截止日期', '优先级', '状态'].map(text =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20 })] })],
          width: text === '事项' ? { size: 40, type: WidthType.PERCENTAGE } : { size: 15, type: WidthType.PERCENTAGE },
        })
      ),
    });

    const dataRows = record.todos.map(todo =>
      new TableRow({
        children: [todo.title, todo.owner, todo.dueDate, todo.priority, todo.status].map(text =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text, size: 20 })] })],
          })
        ),
      })
    );

    children.push(new Paragraph({
      children: [new Table({ rows: [headerRow, ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE } })],
    }));
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${record.title || '会议纪要'}.docx`);
}

/** 导出为 PDF（通过浏览器打印） */
export function exportAsPDF(record: MeetingRecord): void {
  const md = toMarkdown(record);
  // 将 Markdown 转为简单 HTML 用于打印
  const html = mdToHtml(record, md);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    // fallback: 用 iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      iframe.contentWindow?.print();
    }
    setTimeout(() => document.body.removeChild(iframe), 5000);
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  // 等待内容渲染后打印
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };
}

function mdToHtml(record: MeetingRecord, md: string): string {
  // 简单 Markdown → HTML 转换（不需要完整解析器）
  let html = md
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // 表格处理
  html = html.replace(/(<br>\|.+?\|<br>)+/g, (match) => {
    const rows = match.replace(/(^<br>|<br>$)/g, '').split('<br>').filter(r => r.trim());
    if (rows.length < 2) return match;

    let table = '<table>';
    for (let i = 0; i < rows.length; i++) {
      if (i === 1 && rows[i].match(/\|[-:|]+\|/)) continue; // 跳过分隔行
      const cells = rows[i].split('|').filter(c => c.trim());
      const tag = i === 0 ? 'th' : 'td';
      table += '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
    }
    table += '</table>';
    return table;
  });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${record.title || '会议纪要'}</title>
  <style>
    @page { margin: 2cm; }
    body { font-family: -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif; color: #1e293b; line-height: 1.8; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 24px; text-align: center; margin-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 24px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }
    blockquote { color: #64748b; border-left: 3px solid #3b82f6; padding-left: 12px; margin: 12px 0; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; font-size: 13px; }
    th { background: #f1f5f9; font-weight: 600; }
    strong { color: #1e40af; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <p>${html}</p>
</body>
</html>`;
}
