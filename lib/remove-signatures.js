import { PDFDocument } from "@cantoo/pdf-lib";

/**
 * @param {string | Uint8Array | ArrayBuffer} pdfBytes
 * @returns {Promise<Uint8Array | null>} A Uint8Array containing the bytes of
 *   the PDF file with its signatures removed, or null if no signature fields
 *   were found.
 */
export default async function removeSignatures(pdfBytes) {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const form = pdfDoc.getForm();

  let removedSignatures = false;

  for (const field of form.getFields()) {
    if (field.constructor.name === 'PDFSignature') {
      form.removeField(field);
      removedSignatures = true;
    }
  }
  
  return removedSignatures ? pdfDoc.save() : null;
}
