const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

/**
 * Generates an official Legal Metrology Certificate PDF with embedded QR Code.
 * @param {object} data
 * @param {string} data.certificateNumber
 * @param {string} data.applicationNumber
 * @param {string} data.systemSerialNumber
 * @param {string} data.instrumentType
 * @param {string} data.manufacturer
 * @param {string} data.modelNumber
 * @param {string} data.capacity
 * @param {string} data.accuracyClass
 * @param {string} data.unit
 * @param {string} data.ownerName
 * @param {string} data.businessName
 * @param {string} data.installationAddress
 * @param {string} data.verificationDate
 * @param {string} data.expiryDate
 * @param {string} data.officerName
 * @param {string} data.officerDistrict
 * @param {string} data.status
 * @param {string} data.verifyUrl
 * @param {string} outputPath
 * @returns {Promise<{ pdfPath: string, qrDataUrl: string }>}
 */
async function generateCertificatePDF(data, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Generate QR Code PNG Buffer
      const qrCodeBuffer = await QRCode.toBuffer(data.verifyUrl, {
        errorCorrectionLevel: 'H',
        type: 'png',
        margin: 1,
        width: 130,
        color: {
          dark: '#0A2540',
          light: '#FFFFFF'
        }
      });

      // 2. Create PDF Document (A4, portrait, 595.28 x 841.89 pt)
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 45, right: 45 },
        info: {
          Title: `Legal Metrology Certificate - ${data.certificateNumber}`,
          Author: 'Legal Metrology Department - Online Verification System',
          Subject: 'Certificate of Verification for Weighing & Measuring Instrument',
          Keywords: 'metrology, verification, weights, measures, certificate'
        }
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      const pageWidth = 595.28;
      const pageHeight = 841.89;

      // Outer Decorative Border
      doc.rect(25, 25, pageWidth - 50, pageHeight - 50)
        .lineWidth(2.5)
        .strokeColor('#0A2540')
        .stroke();

      // Inner Accent Border
      doc.rect(30, 30, pageWidth - 60, pageHeight - 60)
        .lineWidth(0.8)
        .strokeColor('#D97706')
        .stroke();

      // Top Corner Accents
      const cornerSize = 12;
      doc.rect(34, 34, cornerSize, cornerSize).fill('#0A2540');
      doc.rect(pageWidth - 34 - cornerSize, 34, cornerSize, cornerSize).fill('#0A2540');
      doc.rect(34, pageHeight - 34 - cornerSize, cornerSize, cornerSize).fill('#0A2540');
      doc.rect(pageWidth - 34 - cornerSize, pageHeight - 34 - cornerSize, cornerSize, cornerSize).fill('#0A2540');

      // Header Banner
      doc.rect(32, 50, pageWidth - 64, 75).fill('#0A2540');

      doc.fillColor('#FFFFFF')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('GOVERNMENT LEGAL METROLOGY DEPARTMENT', 32, 60, { align: 'center' });

      doc.fillColor('#FDE68A')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('CERTIFICATE OF VERIFICATION', 32, 76, { align: 'center' });

      doc.fillColor('#E2E8F0')
        .fontSize(9)
        .font('Helvetica')
        .text('Weights and Measures Act & Verification Rules | Online Verification System', 32, 98, { align: 'center' });

      // Certificate Identification Band
      let y = 140;
      doc.rect(45, y, pageWidth - 90, 36).fillAndStroke('#F8FAFC', '#E2E8F0');

      doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold')
        .text('CERTIFICATE NUMBER', 55, y + 6);
      doc.fillColor('#0A2540').fontSize(11).font('Helvetica-Bold')
        .text(data.certificateNumber, 55, y + 18);

      doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold')
        .text('APPLICATION REF', 240, y + 6);
      doc.fillColor('#0A2540').fontSize(10).font('Helvetica')
        .text(data.applicationNumber, 240, y + 19);

      doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold')
        .text('STATUS', 430, y + 6);
      doc.fillColor('#059669').fontSize(10).font('Helvetica-Bold')
        .text(data.status.toUpperCase(), 430, y + 19);

      // Section: Instrument Particulars
      y = 190;
      doc.fillColor('#0A2540').fontSize(11).font('Helvetica-Bold')
        .text('1. INSTRUMENT PARTICULARS', 45, y);
      doc.moveTo(45, y + 15).lineTo(pageWidth - 45, y + 15).lineWidth(1).strokeColor('#0A2540').stroke();

      y += 24;
      const drawRow = (label1, val1, label2, val2, currentY) => {
        doc.rect(45, currentY, (pageWidth - 90) / 2, 22).fillAndStroke('#FFFFFF', '#E2E8F0');
        doc.rect(45 + (pageWidth - 90) / 2, currentY, (pageWidth - 90) / 2, 22).fillAndStroke('#FFFFFF', '#E2E8F0');

        doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold').text(label1, 52, currentY + 6);
        doc.fillColor('#1E293B').fontSize(8.5).font('Helvetica').text(String(val1 || 'N/A'), 155, currentY + 6, { width: 90, ellipsis: true });

        const rightX = 45 + (pageWidth - 90) / 2;
        doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold').text(label2, rightX + 7, currentY + 6);
        doc.fillColor('#1E293B').fontSize(8.5).font('Helvetica').text(String(val2 || 'N/A'), rightX + 115, currentY + 6, { width: 130, ellipsis: true });
      };

      drawRow('System Serial No:', data.systemSerialNumber, 'Instrument Type:', data.instrumentType, y);
      y += 22;
      drawRow('Manufacturer:', data.manufacturer, 'Model Number:', data.modelNumber, y);
      y += 22;
      drawRow('Capacity / Range:', `${data.capacity} ${data.unit}`, 'Accuracy / Class:', data.accuracyClass, y);
      y += 22;
      drawRow('Unit of Measure:', data.unit, 'Place of Installation:', data.installationAddress, y);

      // Section: Verification & Owner Details
      y += 35;
      doc.fillColor('#0A2540').fontSize(11).font('Helvetica-Bold')
        .text('2. APPLICANT & LEGAL ENTITY DETAILS', 45, y);
      doc.moveTo(45, y + 15).lineTo(pageWidth - 45, y + 15).lineWidth(1).strokeColor('#0A2540').stroke();

      y += 24;
      drawRow('Owner / Custodian:', data.ownerName, 'Business Name:', data.businessName || 'N/A', y);
      y += 22;
      drawRow('Verification Date:', data.verificationDate, 'Valid Until:', data.expiryDate, y);

      // Section: Certification Statement
      y += 35;
      doc.fillColor('#0A2540').fontSize(11).font('Helvetica-Bold')
        .text('3. STATUTORY VERIFICATION DECLARATION', 45, y);
      doc.moveTo(45, y + 15).lineTo(pageWidth - 45, y + 15).lineWidth(1).strokeColor('#0A2540').stroke();

      y += 22;
      doc.fillColor('#334155').fontSize(8.5).font('Helvetica')
        .text(
          `This is to certify that the weighing / measuring instrument described above has been duly inspected, tested against certified standard weights/measures, and found to comply with the permissible error tolerances and statutory standards prescribed under the Legal Metrology Act and relevant rules. The instrument is hereby verified and stamped for commercial use within the prescribed jurisdiction until the stated date of expiry.`,
          45, y, { width: pageWidth - 90, align: 'justify', lineGap: 3 }
        );

      // QR Code and Official Stamp Footer Box
      y = 520;
      doc.rect(45, y, pageWidth - 90, 180).fillAndStroke('#F8FAFC', '#CBD5E1');

      // Embed QR Code
      doc.image(qrCodeBuffer, 58, y + 15, { width: 115, height: 115 });
      doc.fillColor('#64748B').fontSize(7.5).font('Helvetica-Bold')
        .text('SCAN TO VERIFY AUTHENTICITY', 50, y + 140, { width: 130, align: 'center' });
      doc.fillColor('#0284C7').fontSize(6.5).font('Helvetica')
        .text(data.verifyUrl, 50, y + 152, { width: 130, align: 'center', ellipsis: true });

      // Verifying Officer & Authority Details
      const officerBoxX = 205;
      doc.fillColor('#0A2540').fontSize(10).font('Helvetica-Bold')
        .text('ISSUED BY AUTHORIZED LEGAL METROLOGY OFFICER', officerBoxX, y + 18);

      doc.fillColor('#475569').fontSize(8.5).font('Helvetica')
        .text(`Verifying Officer: ${data.officerName || 'Inspector of Legal Metrology'}`, officerBoxX, y + 36)
        .text(`Assigned District: ${data.officerDistrict || 'Metrology Jurisdiction'}`, officerBoxX, y + 50)
        .text(`Date of Issue: ${data.verificationDate}`, officerBoxX, y + 64)
        .text(`Security Verification Hash: ${data.certificateNumber}`, officerBoxX, y + 78);

      // Digital Signature Box
      doc.rect(officerBoxX, y + 100, 300, 60).fillAndStroke('#FFFFFF', '#94A3B8');
      doc.fillColor('#059669').fontSize(8).font('Helvetica-Bold')
        .text('DIGITALLY SIGNED & VERIFIED', officerBoxX + 10, y + 110);
      doc.fillColor('#334155').fontSize(7.5).font('Helvetica')
        .text(`Digitally sealed under the authority of Legal Metrology Department.`, officerBoxX + 10, y + 124)
        .text(`Timestamp: ${new Date().toISOString()} | Ref: ${data.certificateNumber}`, officerBoxX + 10, y + 138);

      // Page Bottom Legal Disclaimer
      doc.fillColor('#94A3B8').fontSize(7).font('Helvetica')
        .text(
          'Notice: This digital verification certificate is generated electronically. Any alteration, tampering, or reproduction is an offense under the Legal Metrology Act.',
          45, pageHeight - 45, { align: 'center', width: pageWidth - 90 }
        );

      doc.end();

      writeStream.on('finish', () => {
        resolve({
          pdfPath: outputPath,
          qrCodeData: data.verifyUrl
        });
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateCertificatePDF
};
