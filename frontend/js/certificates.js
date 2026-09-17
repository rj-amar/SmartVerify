/**
 * Online Verification System - Certificates, Public QR Verification, & Renewal Module
 */

const Certificates = {
  list: [],

  async loadCertificates(search = '') {
    const container = document.getElementById('certificates-table-container');
    if (!container) return;

    container.innerHTML = '<div class="empty-state"><i class="bi bi-arrow-repeat spin"></i><p>Loading digital verification certificates...</p></div>';

    let url = '/certificates?limit=100';
    if (search) url += `&search=${encodeURIComponent(search)}`;

    try {
      const res = await apiRequest(url);
      if (!res.ok) {
        container.innerHTML = `<div class="empty-state text-danger"><i class="bi bi-exclamation-triangle"></i><h4>Unable to load certificates</h4><p>${res.data?.error || 'The certificate registry request failed.'}</p></div>`;
        return;
      }

      this.list = Array.isArray(res.data?.certificates) ? res.data.certificates : [];
      this.renderCertificatesTable();
    } catch (err) {
      console.error('[Certificates Load Error]:', err);
      container.innerHTML = `<div class="empty-state text-danger"><i class="bi bi-wifi-off"></i><h4>Certificate registry unavailable</h4><p>Please refresh and try again.</p></div>`;
    }
  },

  renderCertificatesTable() {
    const container = document.getElementById('certificates-table-container');
    if (!container) return;

    if (this.list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-award"></i>
          <h4>No certificates available.</h4>
          <p>Verified instruments will have their official certificates listed here.</p>
        </div>
      `;
      return;
    }

    const isOwner = Auth.getRole() === 'owner';

    const rows = this.list.map(c => {
      const isExpired = new Date(c.expiry_date) < new Date();
      const statusBadge = isExpired ? '<span class="badge badge-danger">Expired</span>' : getStatusBadge(c.certificate_status);

      return `
        <tr>
          <td>
            <strong style="color:var(--primary); font-family:monospace; font-size:0.92rem;">
              ${c.certificate_number}
            </strong>
          </td>
          <td>
            <div style="font-weight:600;">${c.instrument_type}</div>
            <small style="color:var(--text-muted); font-family:monospace;">SN: ${c.system_serial_number} (${c.capacity} ${c.unit_of_measurement})</small>
          </td>
          <td>
            <div>${c.business_name || c.owner_name}</div>
          </td>
          <td>
            <div><i class="bi bi-calendar-check"></i> ${formatDate(c.issue_date)}</div>
          </td>
          <td>
            <div><i class="bi bi-calendar-x"></i> <strong>${formatDate(c.expiry_date)}</strong></div>
          </td>
          <td>${statusBadge}</td>
          <td style="text-align:right; white-space:nowrap;">
            <button class="btn btn-secondary btn-sm" onclick="Certificates.downloadPDF('${c.certificate_number}')">
              <i class="bi bi-download"></i> PDF
            </button>
            <button class="btn btn-outline btn-sm" onclick="Certificates.verifyPublic('${c.certificate_number}')" style="margin-left:4px;" title="Open the public verification page using this certificate's QR verification code">
              <i class="bi bi-qr-code"></i> QR Verify
            </button>
            ${
              isOwner
                ? `<button class="btn btn-outline btn-sm" onclick="Certificates.openRenewModal(${c.id})" style="margin-left:4px;">
                    <i class="bi bi-arrow-repeat"></i> Renew
                   </button>`
                : ''
            }
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Certificate No.</th>
              <th>Instrument</th>
              <th>Owner / Business</th>
              <th>Issue Date</th>
              <th>Valid Until</th>
              <th>Status</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  },

  /**
   * Secure PDF Download
   */
  async downloadPDF(certNumber) {
    const token = Storage.getToken();
    const url = `/api/certificates/pdf/${encodeURIComponent(certNumber)}`;
    try {
      showToast('Preparing your official certificate PDF...', 'info', 2500);
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Download failed' }));
        showToast(err.error || 'Failed to download certificate PDF.', 'danger');
        return;
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Certificate_${certNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      showToast('Certificate downloaded successfully!', 'success');
    } catch (e) {
      showToast('Error downloading certificate file.', 'danger');
    }
  },

  /**
   * Officer Decision Modal (Approve or Reject)
   */
  openApprovalModal(applicationId) {
    const id = Number(applicationId);
    if (!Number.isFinite(id) || id <= 0) {
      showToast('Invalid Application', 'Could not identify this application.', 'danger');
      return;
    }

    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) {
      console.error('modal-container not found in the page.');
      showToast('Decision Unavailable', 'The decision window could not be opened. Please refresh the page.', 'danger');
      return;
    }

    const modalHtml = `
      <div class="modal-backdrop" id="decision-modal" onclick="if(event.target===this) App.closeModal()">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3><i class="bi bi-check2-circle"></i> Verification Final Decision</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p style="font-size:0.88rem; color:var(--text-secondary); margin-bottom:18px;">
              The digital inspection for this instrument is completed. Please select whether to approve and issue an official Digital Certificate or reject the application.
            </p>

            <!-- Approve Section -->
            <div style="background:#ECFDF5; border:1px solid #A7F3D0; padding:16px; border-radius:8px; margin-bottom:18px;">
              <h4 style="color:#065F46; font-size:0.95rem; margin-bottom:8px;">
                <i class="bi bi-patch-check-fill"></i> Option A: Approve & Issue Certificate
              </h4>
              <p style="font-size:0.82rem; color:#047857; margin-bottom:12px;">
                Generates a unique statutory certificate with an embedded security QR code and marks the device as verified.
              </p>
              <div class="form-group">
                <label style="font-size:0.82rem;">Certificate Validity Period <span class="required">*</span></label>
                <select id="cert-validity-years" class="form-control form-control-sm">
                  <option value="1" selected>1 Year (Standard Commercial Validity)</option>
                  <option value="2">2 Years (Industrial / Non-Automated)</option>
                  <option value="5">5 Years (Special Dispensation)</option>
                </select>
              </div>
              <button type="button" class="btn btn-success" id="btn-action-approve" onclick="Certificates.handleApprove(${id})">
                <i class="bi bi-patch-check"></i> Approve & Generate Certificate
              </button>
            </div>

            <!-- Reject Section -->
            <div style="background:#FEF2F2; border:1px solid #FECACA; padding:16px; border-radius:8px;">
              <h4 style="color:#991B1B; font-size:0.95rem; margin-bottom:8px;">
                <i class="bi bi-x-octagon-fill"></i> Option B: Reject Application
              </h4>
              <p style="font-size:0.82rem; color:#B91C1C; margin-bottom:10px;">
                If instrument fails maximum permissible errors, has broken seals, or defective components.
              </p>
              <div class="form-group">
                <label style="font-size:0.82rem;">Statutory Rejection Reason <span class="required">*</span></label>
                <textarea id="app-reject-reason" class="form-control form-control-sm" rows="2" placeholder="Specify failure reason, exceeded error percentage, or physical defects."></textarea>
              </div>
              <button type="button" class="btn btn-danger" id="btn-action-reject" onclick="Certificates.handleReject(${id})">
                <i class="bi bi-x-circle"></i> Reject Application
              </button>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
          </div>
        </div>
      </div>
    `;
    App.setModal(modalHtml);
  },

  async handleApprove(applicationId) {
    const validityYears = document.getElementById('cert-validity-years').value;
    const btn = document.getElementById('btn-action-approve');

    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Generating Certificate & QR Code...';

    const res = await apiRequest('/certificates/approve', {
      method: 'POST',
      body: {
        application_id: applicationId,
        validity_years: validityYears
      }
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-patch-check"></i> Approve & Generate Certificate';

    if (res.ok && res.data.certificate) {
      showToast('Certificate generated successfully!', 'success');
      App.closeModal();
      if (window.OfficerDashboard) OfficerDashboard.loadDashboard();
      if (window.Applications) Applications.loadApplications();
      this.loadCertificates();
    } else {
      showToast(res.data.error || 'Failed to approve application.', 'danger');
    }
  },

  async handleReject(applicationId) {
    const reason = document.getElementById('app-reject-reason').value.trim();
    const btn = document.getElementById('btn-action-reject');

    if (!reason) {
      showToast('A detailed rejection reason is required.', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Rejecting...';

    const res = await apiRequest('/certificates/reject', {
      method: 'POST',
      body: {
        application_id: applicationId,
        rejection_reason: reason
      }
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-x-circle"></i> Reject Application';

    if (res.ok) {
      showToast('Application rejected with reason. Applicant notified.', 'warning');
      App.closeModal();
      if (window.OfficerDashboard) OfficerDashboard.loadDashboard();
      if (window.Applications) Applications.loadApplications();
    } else {
      showToast(res.data.error || 'Failed to reject application.', 'danger');
    }
  },

  /**
   * Public QR Certificate Verification View (NO LOGIN REQUIRED)
   */
  async verifyPublic(certCode) {
    // Support both public verification inputs:
    // 1) the Quick Verification card on the Home page
    // 2) the dedicated Public Certificate Verification page
    const homeInput = document.getElementById('public-search-cert');
    const publicInput = document.getElementById('manual-verify-input');
    const suppliedCode = certCode || homeInput?.value || publicInput?.value || '';
    const cleanCode = String(suppliedCode).trim();

    if (!cleanCode) {
      showToast('Please enter a certificate number to verify.', 'warning');
      return;
    }

    // The QR Verify action from the certificate registry should behave like
    // scanning the QR printed on the official certificate: open the public
    // verification route with this certificate as the code.  The App router
    // then loads the public verification view and calls verifyPublic().
    const homeContainer = document.getElementById('home-public-verify-results');
    const publicContainer = document.getElementById('public-verify-results-container');
    const isPublicView = App && App.currentView === 'public-verify';

    // When launched from the certificate registry, there is no result
    // container on that view. Navigate to the same public URL that the QR
    // code in the certificate PDF represents.
    if (!isPublicView && !homeContainer) {
      window.location.hash = `#verify?code=${encodeURIComponent(cleanCode)}`;
      return;
    }

    const container = isPublicView ? publicContainer : homeContainer;

    if (container) {
      container.innerHTML = `
        <div class="cert-verify-box" style="text-align:center; padding:18px;">
          <div style="font-size:2rem; margin-bottom:8px;"><i class="bi bi-arrow-repeat spin"></i></div>
          <h3 style="margin-bottom:4px;">Verifying Certificate...</h3>
          <p style="color:var(--text-muted); margin:0;">Checking the official SmartVerify Legal Metrology Registry.</p>
        </div>
      `;
    }

    try {
      const res = await apiRequest(`/certificates/verify/${encodeURIComponent(cleanCode)}`);

      if (!res.ok || !res.data?.certificate) {
        const serverMessage = res.data?.message || res.data?.error || 'No official record was found for this certificate.';
        const errHtml = `
          <div class="cert-verify-box" style="border-color:var(--danger); text-align:center; padding:18px;">
            <div class="cert-stamp stamp-invalid">INVALID</div>
            <div style="font-size:3rem; color:var(--danger); margin-bottom:10px;">
              <i class="bi bi-shield-x"></i>
            </div>
            <h3 style="color:var(--danger);">Certificate Not Found / Invalid</h3>
            <p style="color:var(--text-muted); margin-top:8px;">
              ${serverMessage}
            </p>
            <p style="font-family:monospace; margin-top:6px;">${cleanCode}</p>
          </div>
        `;
        if (container) container.innerHTML = errHtml;
        else showToast(serverMessage, 'danger');
        return;
      }

      const c = res.data.certificate;
      const isValid = Boolean(res.data.valid);
      const isExpired = String(c.status || '').toUpperCase() === 'EXPIRED';
      const instrument = c.instrument || {};
      const holder = c.holder || {};
      const authority = c.issuing_authority || {};

      const viewHtml = `
        <div class="cert-verify-box">
          <div class="cert-stamp ${isValid ? '' : 'stamp-invalid'}">
            ${isValid ? 'VERIFIED & VALID' : (c.status || 'INVALID')}
          </div>

          <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:16px;">
            <div class="emblem-icon" style="width:50px; height:50px; font-size:1.5rem;">
              <i class="bi bi-shield-check"></i>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">SmartVerify • Government Legal Metrology</div>
              <h3 style="color:var(--primary); margin:0;">Official Verification Registry</h3>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:20px;">
            <div style="background:#F8FAFC; padding:12px; border-radius:6px;">
              <small style="color:var(--text-muted);">Certificate Number</small>
              <div style="font-weight:700; font-family:monospace; color:var(--primary); font-size:1.1rem;">${c.certificate_number}</div>
            </div>
            <div style="background:#F8FAFC; padding:12px; border-radius:6px;">
              <small style="color:var(--text-muted);">Verification Status</small>
              <div><span class="badge ${isValid ? 'badge-success' : 'badge-danger'}" style="font-size:0.85rem;">${c.status || 'UNKNOWN'}</span></div>
            </div>
            <div style="background:#F8FAFC; padding:12px; border-radius:6px;">
              <small style="color:var(--text-muted);">Issue Date</small>
              <div style="font-weight:600;">${formatDate(c.issue_date)}</div>
            </div>
            <div style="background:#F8FAFC; padding:12px; border-radius:6px;">
              <small style="color:var(--text-muted);">Valid Until</small>
              <div style="font-weight:700; color:${isExpired ? 'var(--danger)' : 'var(--success)'};">${formatDate(c.expiry_date)}</div>
            </div>
          </div>

          <h4 style="font-size:0.95rem; font-weight:700; color:var(--primary); margin-bottom:8px;">
            <i class="bi bi-scale"></i> Verified Instrument Particulars
          </h4>
          <div class="table-responsive" style="margin-bottom:20px;">
            <table class="table" style="font-size:0.85rem;">
              <tbody>
                <tr><th>System Serial Number</th><td style="font-family:monospace; font-weight:700;">${instrument.system_serial_number || 'N/A'}</td></tr>
                <tr><th>Instrument Type</th><td>${instrument.instrument_type || 'N/A'}${instrument.category ? ` (${instrument.category})` : ''}</td></tr>
                <tr><th>Manufacturer & Model</th><td>${instrument.manufacturer || 'N/A'} - ${instrument.model || 'N/A'}</td></tr>
                <tr><th>Capacity & Accuracy</th><td><strong>${instrument.capacity || 'N/A'}</strong> - ${instrument.accuracy_class || 'N/A'}</td></tr>
                <tr><th>Registered Enterprise</th><td>${holder.business_name || 'N/A'} (${holder.owner_name || 'N/A'})</td></tr>
                <tr><th>Jurisdiction</th><td>${holder.jurisdiction || 'N/A'}</td></tr>
                <tr><th>Issuing Authority</th><td>${authority.officer_name || 'N/A'} (${authority.department || 'Department of Legal Metrology'})</td></tr>
              </tbody>
            </table>
          </div>

          <div style="text-align:center; font-size:0.78rem; color:var(--text-muted); border-top:1px solid var(--border); padding-top:14px;">
            <i class="bi bi-database-check"></i> Record verified against the live PostgreSQL Legal Metrology registry.
          </div>
        </div>
      `;

      if (container) {
        container.innerHTML = viewHtml;
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        App.setModal(`
          <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
            <div class="modal-dialog modal-dialog-lg">
              <div class="modal-body" style="padding:0;">${viewHtml}</div>
              <div class="modal-footer"><button class="btn btn-outline" onclick="App.closeModal()">Close</button></div>
            </div>
          </div>
        `);
      }
    } catch (error) {
      console.error('[SmartVerify Public Verify Error]:', error);
      const message = 'Certificate verification service is temporarily unavailable. Please check that the backend server is running.';
      if (container) {
        container.innerHTML = `<div class="cert-verify-box" style="border-color:var(--danger); text-align:center;"><h3 style="color:var(--danger);">Verification Failed</h3><p style="color:var(--text-muted);">${message}</p></div>`;
      } else {
        showToast(message, 'danger');
      }
    }
  },

};

// Expose the module to the main router and inline UI handlers.
window.Certificates = Certificates;
