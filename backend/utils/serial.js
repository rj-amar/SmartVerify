const db = require('../db/database');

/**
 * Atomically generates the next sequential system serial number for instruments.
 * Format: OVS-000001
 * @param {object} [client] - Optional pg client for running inside a transaction
 * @returns {Promise<string>}
 */
async function getNextInstrumentSerial(client = null) {
  const runner = client || db;
  const res = await runner.query("SELECT nextval('instrument_serial_seq') AS num");
  const num = parseInt(res.rows[0].num, 10);
  return `OVS-${String(num).padStart(6, '0')}`;
}

/**
 * Atomically generates the next unique application number.
 * Format: APP-YYYY-000001
 * @param {object} [client] - Optional pg client for running inside a transaction
 * @returns {Promise<string>}
 */
async function getNextApplicationNumber(client = null) {
  const runner = client || db;
  const year = new Date().getFullYear();
  const res = await runner.query("SELECT nextval('app_serial_seq') AS num");
  const num = parseInt(res.rows[0].num, 10);
  return `APP-${year}-${String(num).padStart(6, '0')}`;
}

/**
 * Atomically generates the next unique certificate number.
 * Format: CERT-YYYY-000001
 * @param {object} [client] - Optional pg client for running inside a transaction
 * @returns {Promise<string>}
 */
async function getNextCertificateNumber(client = null) {
  const runner = client || db;
  const year = new Date().getFullYear();
  const res = await runner.query("SELECT nextval('cert_serial_seq') AS num");
  const num = parseInt(res.rows[0].num, 10);
  return `CERT-${year}-${String(num).padStart(6, '0')}`;
}

module.exports = {
  getNextInstrumentSerial,
  getNextApplicationNumber,
  getNextCertificateNumber
};
