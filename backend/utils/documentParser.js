const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/** Extract plain text from a PDF or DOCX buffer */
async function parseDocument(buffer, mimeType) {
  let text = '';

  if (mimeType.includes('pdf')) {
    try {
      const data = await pdfParse(buffer);
      text = data.text;
    } catch (err) {
      throw new Error(`PDF parsing failed: ${err.message}`);
    }
  } else if (mimeType.includes('word') || mimeType.includes('docx') || mimeType.includes('openxmlformats')) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } catch (err) {
      throw new Error(`DOCX parsing failed: ${err.message}`);
    }
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  if (!text?.trim()) {
    throw new Error('No text could be extracted. File may be scanned or image-based.');
  }

  return text;
}

module.exports = { parseDocument };
