/**
 * Online Verification System - Applications & Verification Wizard Module
 */

const Applications = {
  list: [],
  wizardState: {
    step: 1,
    instrumentId: null,
    instrument: null,
    district: '',
    location: '',
    date: '',
    notes: '',
    uploadedDocs: []
  },

  async loadApplications(search = '') {
    const container = document.getElementById('applications-table-container');
    if (!container) return;

    container.innerHTML = '<div class="empty-state"><i class="bi bi-arrow-repeat spin"></i><p>Loading applications from database...</p></div>';

    let url = '/applications?limit=100';
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const res = await apiRequest(url);
    if (!res.ok) {
      container.innerHTML = `<div class="empty-state text-danger"><p>${res.data.error || 'Failed to load applications.'}</p></div>`;
      return;
    }

    this.list = res.data.applications || [];
    this.renderApplicationsTable();
  },

  renderApplicationsTable() {
    const container = document.getElementById('applications-table-container');
    if (!container) return;

    if (this.list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-file-earmark-text"></i>
          <h4>No applications found.</h4>
          <p>You have not submitted any verification applications yet.</p>
          ${
            Auth.getRole() === 'owner'
              ? `<button class="btn btn-primary" style="margin-top:14px;" onclick="Applications.openNewWizard()">
                   <i class="bi bi-send-check"></i> Apply for Verification
                 </button>`
              : ''
          }
        </div>
      `;
      return;
    }

    const isOfficer = Auth.getRole() === 'officer';

    const rows = this.list.map(app => `
      <tr>
        <td>
          <strong style="color:var(--primary); font-family:monospace; font-size:0.92rem;">
            ${app.application_number}
          </strong>
          <div><small class="badge badge-secondary">${app.application_type.toUpperCase()}</small></div>
        </td>
        <td>
          <div style="font-weight:600;">${app.instrument_type}</div>
          <small style="color:var(--text-muted); font-family:monospace;">SN: ${app.system_serial_number}</small>
        </td>
        <td>
          <div>${app.business_name || app.applicant_name}</div>
          <small style="color:var(--text-muted);"><i class="bi bi-geo-alt"></i> ${app.inspection_district}</small>
        </td>
        <td>
          ${
            app.officer_name
              ? `<div style="font-weight:600; color:var(--primary);">${app.officer_name}</div><small style="color:var(--text-muted);">${app.officer_email}</small>`
              : `<span class="badge badge-warning"><i class="bi bi-hourglass-split"></i> Awaiting Assignment</span>`
          }
        </td>
        <td>${getStatusBadge(app.status)}</td>
        <td><small>${formatDate(app.submitted_at)}</small></td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="btn btn-outline btn-sm" onclick="Applications.viewTrackingModal(${app.id})">
            <i class="bi bi-timeline"></i> Track
          </button>
          ${
            isOfficer && (app.status === 'submitted' || app.status === 'under_review')
              ? `<button class="btn btn-primary btn-sm" style="margin-left:6px;" onclick="Inspections.openScheduleModal(${app.id})">
                  <i class="bi bi-calendar-plus"></i> Schedule
                 </button>`
              : ''
          }
          ${
            isOfficer && app.status === 'inspection_completed'
              ? `<button class="btn btn-success btn-sm" style="margin-left:6px;" onclick="Certificates.openApprovalModal(${app.id})">
                  <i class="bi bi-patch-check"></i> Decide
                 </button>`
              : ''
          }
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Application Ref</th>
              <th>Instrument Details</th>
              <th>Applicant & District</th>
              <th>Assigned Officer</th>
              <th>Status</th>
              <th>Submitted</th>
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
   * 5-Step Verification Application Wizard
   */
  async openNewWizard(preselectedInstrumentId = null, requestedType = 'initial') {
    // 1. Fetch owner's instruments
    const res = await apiRequest('/instruments?limit=100');
    if (!res.ok) {
      showToast('Failed to load registered instruments.', 'danger');
      return;
    }

    const allInstruments = res.data.instruments || [];
    const selected = preselectedInstrumentId
      ? allInstruments.find(i => Number(i.id) === Number(preselectedInstrumentId))
      : null;
    const instruments = allInstruments.filter(i =>
      i.status === 'registered' || i.status === 'rejected' || i.status === 'expired' ||
      (selected && Number(i.id) === Number(selected.id) && i.status === 'verified' && requestedType === 'reverification')
    );

    if (instruments.length === 0) {
      showToast('You must register an instrument before applying for verification.', 'warning');
      Instruments.openRegisterModal();
      return;
    }

    this.wizardState = {
      step: 1,
      instrumentId: preselectedInstrumentId || instruments[0].id,
      instrumentsList: instruments,
      district: Auth.currentUser ? Auth.currentUser.district : '',
      location: Auth.currentUser ? Auth.currentUser.address : '',
      date: '',
      notes: '',
      applicationType: ['initial', 'renewal', 'reverification'].includes(requestedType) ? requestedType : 'initial',
      tempAppId: null,
      uploadedDocs: []
    };

    this.renderWizardModal();
  },

  renderWizardModal() {
    const s = this.wizardState;
    const inst = s.instrumentsList.find(i => i.id === parseInt(s.instrumentId, 10)) || s.instrumentsList[0];
    s.instrumentId = inst.id;

    const modalHtml = `
      <div class="modal-backdrop" id="wizard-modal">
        <div class="modal-dialog modal-dialog-lg">
          <div class="modal-header">
            <h3><i class="bi bi-patch-check-fill"></i> Statutory Verification Application Wizard</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <!-- Stepper Bar -->
            <div class="wizard-steps">
              <div class="wizard-step ${s.step >= 1 ? (s.step > 1 ? 'completed' : 'active') : ''}">
                <div class="step-bubble">${s.step > 1 ? '✓' : '1'}</div>
                <div class="step-label">Select Device</div>
              </div>
              <div class="wizard-step ${s.step >= 2 ? (s.step > 2 ? 'completed' : 'active') : ''}">
                <div class="step-bubble">${s.step > 2 ? '✓' : '2'}</div>
                <div class="step-label">Location & District</div>
              </div>
              <div class="wizard-step ${s.step >= 3 ? (s.step > 3 ? 'completed' : 'active') : ''}">
                <div class="step-bubble">${s.step > 3 ? '✓' : '3'}</div>
                <div class="step-label">Inspection Date</div>
              </div>
              <div class="wizard-step ${s.step >= 4 ? (s.step > 4 ? 'completed' : 'active') : ''}">
                <div class="step-bubble">${s.step > 4 ? '✓' : '4'}</div>
                <div class="step-label">Documents</div>
              </div>
              <div class="wizard-step ${s.step >= 5 ? 'active' : ''}">
                <div class="step-bubble">5</div>
                <div class="step-label">Review & Submit</div>
              </div>
            </div>

            <!-- Step 1: Instrument -->
            <div id="wizard-step-1" style="${s.step === 1 ? '' : 'display:none;'}">
              <h4 style="margin-bottom:12px; font-size:1rem; color:var(--primary);">Step 1: Select Registered Instrument</h4>
              <div class="form-group">
                <label>Choose Instrument for Statutory Verification <span class="required">*</span></label>
                <select id="w-instrument" class="form-control" onchange="Applications.wizardState.instrumentId = parseInt(this.value, 10); Applications.renderWizardModal();">
                  ${s.instrumentsList.map(i => `
                    <option value="${i.id}" ${i.id === s.instrumentId ? 'selected' : ''}>
                      ${i.system_serial_number} - ${i.instrument_type} (${i.capacity} ${i.unit_of_measurement}) - [${i.status}]
                    </option>
                  `).join('')}
                </select>
              </div>

              <div style="background:#F8FAFC; border:1px solid var(--border); padding:16px; border-radius:8px; margin-top:16px;">
                <div style="font-weight:700; color:var(--primary); margin-bottom:8px;">Instrument Specifications</div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; font-size:0.85rem;">
                  <div><span style="color:var(--text-muted);">Serial Number:</span> <br><strong>${inst.system_serial_number}</strong></div>
                  <div><span style="color:var(--text-muted);">Category:</span> <br><strong>${inst.category}</strong></div>
                  <div><span style="color:var(--text-muted);">Manufacturer:</span> <br><strong>${inst.manufacturer}</strong></div>
                  <div><span style="color:var(--text-muted);">Capacity & Unit:</span> <br><strong>${inst.capacity} ${inst.unit_of_measurement}</strong></div>
                  <div><span style="color:var(--text-muted);">Accuracy Class:</span> <br><strong>${inst.accuracy_class}</strong></div>
                  <div><span style="color:var(--text-muted);">Place of Installation:</span> <br><strong>${inst.installation_place}</strong></div>
                </div>
              </div>
            </div>

            <!-- Step 2: District & Location -->
            <div id="wizard-step-2" style="${s.step === 2 ? '' : 'display:none;'}">
              <h4 style="margin-bottom:12px; font-size:1rem; color:var(--primary);">Step 2: Inspection District & Premises Address</h4>
              <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:14px;">
                The inspection district determines the automatic jurisdictional assignment of your Legal Metrology Verification Officer.
              </p>

              <div class="form-row">
                <div class="form-group">
                  <label>Inspection District <span class="required">*</span></label>
                  <input type="text" id="w-district" class="form-control" value="${s.district}" placeholder="Enter inspection district (e.g. Purnea)" required />
                  <div class="form-hint">District matching is case-insensitive (e.g. "Purnea")</div>
                </div>
                <div class="form-group">
                  <label>Applicant Business Name</label>
                  <input type="text" class="form-control" value="${Auth.currentUser ? (Auth.currentUser.business_name || Auth.currentUser.full_name) : ''}" disabled />
                </div>
              </div>

              <div class="form-group">
                <label>Precise Physical Inspection Location / Premises Address <span class="required">*</span></label>
                <textarea id="w-location" class="form-control" rows="3" placeholder="Exact address where weights & measures officer will inspect device" required>${s.location}</textarea>
              </div>
            </div>

            <!-- Step 3: Preferred Date & Notes -->
            <div id="wizard-step-3" style="${s.step === 3 ? '' : 'display:none;'}">
              <h4 style="margin-bottom:12px; font-size:1rem; color:var(--primary);">Step 3: Preferred Inspection Schedule & Field Notes</h4>
              <div class="form-row">
                <div class="form-group">
                  <label>Preferred Date of Inspection</label>
                  <input type="date" id="w-date" class="form-control" value="${s.date}" min="${new Date().toISOString().split('T')[0]}" />
                  <div class="form-hint">Subject to officer scheduling and duty itinerary</div>
                </div>
                <div class="form-group">
                  <label>Application Type</label>
                  <select id="w-app-type" class="form-control" onchange="Applications.wizardState.applicationType=this.value">
                    <option value="initial" ${s.applicationType === 'initial' ? 'selected' : ''}>Initial Verification</option>
                    <option value="reverification" ${s.applicationType === 'reverification' ? 'selected' : ''}>Periodic Reverification</option>
                    <option value="renewal" ${s.applicationType === 'renewal' ? 'selected' : ''}>Certificate Renewal</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label>Special Notes for Inspector</label>
                <textarea id="w-notes" class="form-control" rows="3" placeholder="Access instructions, working hours, or site safety protocols">${s.notes}</textarea>
              </div>
            </div>

            <!-- Step 4: Document Uploads -->
            <div id="wizard-step-4" style="${s.step === 4 ? '' : 'display:none;'}">
              <h4 style="margin-bottom:12px; font-size:1rem; color:var(--primary);">Step 4: Statutory Document Uploads</h4>
              <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:16px;">
                Upload required certificates, invoices, or calibration reports (PDF, JPG, PNG up to 5 MB each).
              </p>

              <div style="background:#F1F5F9; border:1px solid var(--border); padding:16px; border-radius:8px; margin-bottom:16px;">
                <div class="form-row">
                  <div class="form-group">
                    <label>Document Category <span class="required">*</span></label>
                    <select id="w-doc-type" class="form-control">
                      ${CONFIG.DOCUMENT_TYPES.map(dt => `<option value="${dt}">${dt}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Select File (Max 5MB) <span class="required">*</span></label>
                    <input type="file" id="w-doc-file" class="form-control" accept=".pdf,.jpg,.jpeg,.png,.webp" />
                  </div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="Applications.stageDocument()">
                  <i class="bi bi-cloud-arrow-up"></i> Add Document
                </button>
              </div>

              <div id="staged-docs-container">
                ${
                  s.uploadedDocs.length > 0
                    ? `<div style="font-weight:600; font-size:0.85rem; margin-bottom:8px;">Staged Documents (${s.uploadedDocs.length}):</div>
                       <ul style="list-style:none; display:flex; flex-direction:column; gap:6px;">
                         ${s.uploadedDocs.map((d, idx) => `
                           <li style="background:#FFFFFF; border:1px solid var(--border); padding:8px 12px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; font-size:0.85rem;">
                             <div><i class="bi bi-file-earmark-pdf"></i> <strong>${d.type}:</strong> ${d.file.name} (${(d.file.size/1024).toFixed(1)} KB)</div>
                             <button type="button" class="btn btn-danger btn-sm" onclick="Applications.removeStagedDoc(${idx})">&times;</button>
                           </li>
                         `).join('')}
                       </ul>`
                    : '<div style="color:var(--text-muted); font-size:0.82rem; font-style:italic;">No documents staged yet. You can attach documents now or upload them later.</div>'
                }
              </div>
            </div>

            <!-- Step 5: Review & Submit -->
            <div id="wizard-step-5" style="${s.step === 5 ? '' : 'display:none;'}">
              <h4 style="margin-bottom:12px; font-size:1rem; color:var(--primary);">Step 5: Review Application Summary</h4>
              <div class="table-responsive">
                <table class="table" style="font-size:0.88rem;">
                  <tbody>
                    <tr><th>Selected Instrument</th><td>${inst.system_serial_number} (${inst.instrument_type})</td></tr>
                    <tr><th>Capacity & Unit</th><td>${inst.capacity} ${inst.unit_of_measurement} - ${inst.accuracy_class}</td></tr>
                    <tr><th>Inspection District</th><td><strong>${s.district}</strong></td></tr>
                    <tr><th>Inspection Location</th><td>${s.location}</td></tr>
                    <tr><th>Preferred Date</th><td>${s.date || 'Flexible / As per schedule'}</td></tr>
                    <tr><th>Notes</th><td>${s.notes || 'None'}</td></tr>
                    <tr><th>Attached Documents</th><td>${s.uploadedDocs.length} file(s) staged</td></tr>
                  </tbody>
                </table>
              </div>

              <div class="alert alert-info" style="background:#EFF6FF; border:1px solid #BFDBFE; padding:12px; border-radius:6px; font-size:0.85rem; margin-top:14px; color:#1E40AF;">
                <i class="bi bi-cpu"></i> <strong>Automated Jurisdictional Officer Assignment:</strong> Upon submission, the system will match active Legal Metrology Officers in <strong>${s.district}</strong> and assign your application to the officer with the lowest active workload.
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
            ${
              s.step > 1
                ? `<button type="button" class="btn btn-outline" onclick="Applications.prevStep()">Back</button>`
                : ''
            }
            ${
              s.step < 5
                ? `<button type="button" class="btn btn-primary" onclick="Applications.nextStep()">Next Step <i class="bi bi-arrow-right"></i></button>`
                : `<button type="button" class="btn btn-success" id="btn-submit-app" onclick="Applications.submitApplication()">
                    <i class="bi bi-check-circle-fill"></i> Submit Verification Application
                   </button>`
            }
          </div>
        </div>
      </div>
    `;
    App.setModal(modalHtml);
  },

  nextStep() {
    const s = this.wizardState;
    if (s.step === 1) {
      if (!s.instrumentId) {
        showToast('Please select an instrument.', 'warning');
        return;
      }
    } else if (s.step === 2) {
      const dist = document.getElementById('w-district').value.trim();
      const loc = document.getElementById('w-location').value.trim();
      if (!dist || !loc) {
        showToast('Inspection District and Location Address are required.', 'warning');
        return;
      }
      s.district = dist;
      s.location = loc;
    } else if (s.step === 3) {
      s.date = document.getElementById('w-date').value;
      s.notes = document.getElementById('w-notes').value.trim();
    }
    s.step++;
    this.renderWizardModal();
  },

  prevStep() {
    if (this.wizardState.step > 1) {
      this.wizardState.step--;
      this.renderWizardModal();
    }
  },

  stageDocument() {
    const type = document.getElementById('w-doc-type').value;
    const fileInput = document.getElementById('w-doc-file');
    const file = fileInput.files[0];

    if (!file) {
      showToast('Please select a file to upload.', 'warning');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('File size exceeds the 5 MB limit.', 'danger');
      return;
    }

    this.wizardState.uploadedDocs.push({ type, file });
    fileInput.value = '';
    this.renderWizardModal();
    showToast(`Staged document: ${file.name}`, 'info');
  },

  removeStagedDoc(index) {
    this.wizardState.uploadedDocs.splice(index, 1);
    this.renderWizardModal();
  },

  async submitApplication() {
    const s = this.wizardState;
    const btn = document.getElementById('btn-submit-app');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Submitting Application & Assigning Officer...';

    // 1. Submit Application
    const res = await apiRequest('/applications', {
      method: 'POST',
      body: {
        instrument_id: parseInt(s.instrumentId, 10),
        application_type: s.applicationType || document.getElementById('w-app-type')?.value || 'initial',
        inspection_district: s.district,
        inspection_location: s.location,
        preferred_inspection_date: s.date || null,
        application_notes: s.notes || null
      }
    });

    if (!res.ok || !res.data.application) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Submit Verification Application';
      showToast(res.data.error || 'Failed to submit application.', 'danger');
      return;
    }

    const app = res.data.application;

    // 2. Upload any staged documents
    const documentUploadFailures = [];
    if (s.uploadedDocs.length > 0) {
      for (const item of s.uploadedDocs) {
        const formData = new FormData();
        formData.append('document_type', item.type);
        formData.append('document', item.file);
        const uploadRes = await apiRequest(`/documents/${app.id}/upload`, {
          method: 'POST',
          body: formData
        });
        if (!uploadRes.ok) {
          documentUploadFailures.push(`${item.file.name}: ${uploadRes.data.error || 'upload failed'}`);
        }
      }
    }

    App.closeModal();
    if (documentUploadFailures.length > 0) {
      showToast(`Application submitted, but ${documentUploadFailures.length} document(s) failed to upload. You can upload them from the application.`, 'warning', 7000);
    }

    // Show Success Modal with assignment status
    const successHtml = `
      <div class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header" style="background:#ECFDF5; border-bottom:1px solid #A7F3D0;">
            <h3 style="color:#065F46;"><i class="bi bi-check-circle-fill"></i> Application Submitted Successfully</h3>
          </div>
          <div class="modal-body" style="text-align:center; padding: 24px 20px;">
            <div style="font-size:3rem; color:#059669; margin-bottom:10px;">
              <i class="bi bi-send-check-fill"></i>
            </div>
            <h4>Application Reference Number</h4>
            <div style="font-size:1.8rem; font-weight:800; color:var(--primary); font-family:monospace; margin:10px 0;">
              ${app.application_number}
            </div>

            <div style="background:#F8FAFC; border:1px solid var(--border); padding:14px; border-radius:8px; margin:16px 0; text-align:left; font-size:0.85rem;">
              <div style="font-weight:700; color:var(--primary); margin-bottom:4px;">
                <i class="bi bi-person-badge"></i> Officer Assignment Status:
              </div>
              <p style="color:var(--text-secondary); margin:0;">
                ${res.data.assignment_notice}
              </p>
            </div>

            <p style="font-size:0.82rem; color:var(--text-muted);">
              You can track your application status, inspect scheduled dates, and download your certificate once verified.
            </p>
          </div>
          <div class="modal-footer" style="justify-content:center;">
            <button class="btn btn-primary" onclick="App.closeModal(); Applications.viewTrackingModal(${app.id});">
              <i class="bi bi-timeline"></i> Track Application Now
            </button>
          </div>
        </div>
      </div>
    `;
    App.setModal(successHtml);
    this.loadApplications();
    if (window.Instruments) Instruments.loadInstruments();
  },

  async fetchProtectedFile(endpoint) {
    const token = Storage.getToken();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      let message = 'Unable to retrieve the file.';
      try {
        const data = await response.json();
        message = data.error || message;
      } catch (_) {}
      throw new Error(message);
    }
    return response.blob();
  },

  async viewDocument(filename) {
    try {
      const blob = await this.fetchProtectedFile(`/documents/file/${encodeURIComponent(filename)}`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error('[Document View Error]', err);
      showToast(err.message || 'Unable to open document.', 'danger');
    }
  },

  async viewInspectionPhoto(filename) {
    try {
      const photoTab = window.open('about:blank', '_blank');
      if (!photoTab) {
        showToast('Please allow pop-ups to view the inspection photograph.', 'warning');
        return;
      }

      photoTab.document.title = 'SmartVerify — Inspection Photograph';
      photoTab.document.body.innerHTML = '<p style="font-family:Arial,sans-serif;padding:24px;">Loading inspection photograph...</p>';

      const blob = await this.fetchProtectedFile(`/inspections/photo/${encodeURIComponent(filename)}`);
      const url = URL.createObjectURL(blob);
      photoTab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error('[Inspection Photo View Error]', err);
      showToast(err.message || 'Unable to open inspection photograph.', 'danger');
    }
  },

  async downloadDocument(filename, originalName) {
    try {
      const blob = await this.fetchProtectedFile(`/documents/file/${encodeURIComponent(filename)}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = originalName || filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('[Document Download Error]', err);
      showToast(err.message || 'Unable to download document.', 'danger');
    }
  },

  async updateDocumentStatus(documentId, status) {
    let rejection_reason = '';
    if (status === 'rejected') {
      rejection_reason = window.prompt('Enter the reason for rejecting this document:')?.trim() || '';
      if (!rejection_reason) {
        showToast('A rejection reason is required.', 'warning');
        return;
      }
    }

    const res = await apiRequest(`/documents/${documentId}/status`, {
      method: 'PATCH',
      body: { status, rejection_reason: rejection_reason || null }
    });

    if (!res.ok) {
      showToast(res.data.error || 'Failed to update document status.', 'danger');
      return;
    }

    showToast(`Document marked as ${status}.`, 'success');
    // Refresh the complete application view so the reviewer/status data stays current.
    await this.viewTrackingModal(res.data.document.application_id);
  },

  async uploadDocumentFromTracker(appId) {
    const typeEl = document.getElementById(`tracker-doc-type-${appId}`);
    const fileEl = document.getElementById(`tracker-doc-file-${appId}`);
    const btn = document.getElementById(`tracker-doc-upload-${appId}`);
    const file = fileEl?.files?.[0];
    const type = typeEl?.value?.trim();

    if (!file || !type) {
      showToast('Select a document type and file first.', 'warning');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('File size exceeds the 5 MB limit.', 'danger');
      return;
    }

    const formData = new FormData();
    formData.append('document_type', type);
    formData.append('document', file);
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Uploading...';

    const res = await apiRequest(`/documents/${appId}/upload`, { method: 'POST', body: formData });
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-cloud-arrow-up"></i> Upload';

    if (!res.ok) {
      showToast(res.data.error || 'Failed to upload document.', 'danger');
      return;
    }

    showToast('Document uploaded successfully and sent for officer review.', 'success');
    await this.viewTrackingModal(appId);
  },

  /**
   * Application Timeline & Status Tracking Modal
   */
  async viewTrackingModal(appId) {
    const res = await apiRequest(`/applications/${appId}`);
    if (!res.ok) {
      showToast(res.data.error || 'Failed to load tracking data.', 'danger');
      return;
    }

    const app = res.data.application;
    const docs = res.data.documents || [];
    const insp = res.data.inspection;

    // Status order for stepper
    const statuses = [
      { key: 'submitted', label: 'Submitted' },
      { key: 'under_review', label: 'Under Review' },
      { key: 'inspection_scheduled', label: 'Inspection Scheduled' },
      { key: 'inspection_completed', label: 'Inspection Completed' },
      { key: 'verified', label: 'Verified & Certified' }
    ];

    const currentStatus = app.status;
    let currentIdx = statuses.findIndex(s => s.key === currentStatus);
    if (currentStatus === 'rejected') currentIdx = -1;

    const timelineHtml = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal-dialog modal-dialog-lg">
          <div class="modal-header">
            <h3><i class="bi bi-timeline"></i> Application Tracker: ${app.application_number}</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <!-- Header Card -->
            <div style="background:#F8FAFC; border:1px solid var(--border); padding:16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
              <div>
                <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Instrument Details</span>
                <div style="font-weight:700; font-size:1.05rem; color:var(--primary);">
                  ${app.instrument_type} (${app.capacity} ${app.unit_of_measurement})
                </div>
                <small style="color:var(--text-muted); font-family:monospace;">Serial: ${app.system_serial_number}</small>
              </div>
              <div>
                <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Current State</span>
                <div>${getStatusBadge(app.status)}</div>
              </div>
              <div>
                <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Assigned Officer</span>
                <div style="font-weight:600;">${app.officer_name || '<span class="text-warning">Pending Assignment</span>'}</div>
                <small style="color:var(--text-muted);">${app.officer_email || ''}</small>
              </div>
            </div>

            ${
              app.status === 'rejected'
                ? `<div class="alert alert-danger" style="background:#FEF2F2; border:1px solid #FECACA; padding:14px; border-radius:8px; margin-bottom:20px; color:#991B1B;">
                    <strong><i class="bi bi-x-circle-fill"></i> Application Rejected:</strong>
                    <p style="margin-top:4px; font-size:0.88rem;">${app.rejection_reason || 'Standards not met.'}</p>
                   </div>`
                : ''
            }

            <!-- Stepper Timeline -->
            <div class="timeline" style="margin-bottom:24px;">
              <div class="timeline-item ${currentIdx >= 0 ? 'passed' : ''}">
                <div class="timeline-point"></div>
                <div class="timeline-content">
                  <h4>1. Application Submitted</h4>
                  <p>Submitted on ${formatDateTime(app.submitted_at)} for inspection district: <strong>${app.inspection_district}</strong></p>
                </div>
              </div>
              <div class="timeline-item ${currentIdx >= 1 ? 'passed' : (currentIdx === 0 ? 'active' : '')}">
                <div class="timeline-point"></div>
                <div class="timeline-content">
                  <h4>2. Officer Review & Assignment</h4>
                  <p>${app.officer_name ? `Assigned to Inspector ${app.officer_name} (${app.inspection_district} Metrology Office)` : 'Awaiting officer allocation.'}</p>
                </div>
              </div>
              <div class="timeline-item ${currentIdx >= 2 ? 'passed' : (currentIdx === 1 ? 'active' : '')}">
                <div class="timeline-point"></div>
                <div class="timeline-content">
                  <h4>3. Physical & Digital Inspection</h4>
                  <p>${insp ? `Scheduled for ${formatDate(insp.scheduled_date)} at ${insp.scheduled_time}. Location: ${insp.inspection_location}` : 'Inspection pending scheduling.'}</p>
                </div>
              </div>
              <div class="timeline-item ${currentIdx >= 3 ? 'passed' : (currentIdx === 2 ? 'active' : '')}">
                <div class="timeline-point"></div>
                <div class="timeline-content">
                  <h4>4. Inspection Completed & Standards Verified</h4>
                  <p>${insp && insp.completed_at ? `Inspection completed on ${formatDateTime(insp.completed_at)}. Test measurements logged.` : 'Awaiting physical test execution.'}</p>
                </div>
              </div>
              <div class="timeline-item ${currentIdx >= 4 ? 'passed' : (currentIdx === 3 ? 'active' : '')}">
                <div class="timeline-point"></div>
                <div class="timeline-content">
                  <h4>5. Verification Certificate Issued</h4>
                  <p>${app.certificate_number ? `Certificate <strong>${app.certificate_number}</strong> issued. Valid until ${formatDate(app.certificate_expiry_date)}.` : 'Pending final decision and digital stamp.'}</p>
                </div>
              </div>
            </div>

            <!-- Documents Section -->
            <h4 style="font-size:0.95rem; font-weight:700; color:var(--primary); margin-bottom:10px;">
              <i class="bi bi-file-earmark-check"></i> Application Documents (${docs.length})
            </h4>
            <div class="table-responsive" style="margin-bottom:20px;">
              <table class="table" style="font-size:0.82rem;">
                <thead>
                  <tr><th>Type</th><th>Filename</th><th>Status</th><th>Reviewer</th><th style="text-align:right;">Actions</th></tr>
                </thead>
                <tbody>
                  ${
                    docs.length > 0
                      ? docs.map(d => `
                          <tr>
                            <td><strong>${d.document_type}</strong></td>
                            <td>
                              <div style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${d.original_filename}">${d.original_filename}</div>
                              <small style="color:var(--text-muted);">${d.mime_type || 'File'} • ${d.file_size ? (Number(d.file_size) / 1024).toFixed(1) + ' KB' : ''}</small>
                            </td>
                            <td>${getStatusBadge(d.verification_status)}</td>
                            <td>${d.reviewed_by_name || 'Pending'}${d.rejection_reason ? `<div style="color:#B91C1C; font-size:0.75rem; margin-top:3px;">${d.rejection_reason}</div>` : ''}</td>
                            <td style="text-align:right; white-space:nowrap;">
                              <button class="btn btn-outline btn-sm" onclick="Applications.viewDocument('${d.stored_filename}')" title="View document">
                                <i class="bi bi-eye"></i> View
                              </button>
                              <button class="btn btn-outline btn-sm" style="margin-left:4px;" onclick="Applications.downloadDocument('${d.stored_filename}', '${String(d.original_filename).replace(/'/g, "\\'")}')" title="Download document">
                                <i class="bi bi-download"></i>
                              </button>
                              ${
                                ['officer', 'admin'].includes(Auth.getRole())
                                  ? `<button class="btn btn-success btn-sm" style="margin-left:4px;" onclick="Applications.updateDocumentStatus(${d.id}, 'verified')" ${d.verification_status === 'verified' ? 'disabled' : ''}>
                                      <i class="bi bi-check-lg"></i>
                                    </button>
                                    <button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="Applications.updateDocumentStatus(${d.id}, 'rejected')" ${d.verification_status === 'rejected' ? 'disabled' : ''}>
                                      <i class="bi bi-x-lg"></i>
                                    </button>`
                                  : ''
                              }
                            </td>
                          </tr>
                        `).join('')
                      : '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No documents uploaded yet.</td></tr>'
                  }
                </tbody>
              </table>
            </div>

            ${
              Auth.getRole() === 'owner' && !['verified', 'certificate_issued'].includes(app.status)
                ? `<div style="background:#F8FAFC; border:1px dashed var(--border); padding:14px; border-radius:8px; margin-bottom:20px;">
                    <div style="font-weight:700; color:var(--primary); margin-bottom:8px;"><i class="bi bi-cloud-arrow-up"></i> Upload Additional Supporting Document</div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                      <select id="tracker-doc-type-${app.id}" class="form-control form-control-sm" style="max-width:260px;">
                        ${CONFIG.DOCUMENT_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                      </select>
                      <input id="tracker-doc-file-${app.id}" type="file" class="form-control form-control-sm" accept=".pdf,.jpg,.jpeg,.png,.webp" style="max-width:320px;" />
                      <button id="tracker-doc-upload-${app.id}" class="btn btn-primary btn-sm" onclick="Applications.uploadDocumentFromTracker(${app.id})">
                        <i class="bi bi-cloud-arrow-up"></i> Upload
                      </button>
                    </div>
                  </div>`
                : ''
            }

            ${
              insp
                ? `<div style="border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:20px;">
                    <h4 style="font-size:0.95rem; font-weight:700; color:var(--primary); margin-bottom:10px;"><i class="bi bi-clipboard2-check"></i> Inspection Summary</h4>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; font-size:0.82rem; margin-bottom:12px;">
                      <div><small style="color:var(--text-muted);">Scheduled</small><br><strong>${formatDate(insp.scheduled_date)} ${insp.scheduled_time || ''}</strong></div>
                      <div><small style="color:var(--text-muted);">Location</small><br><strong>${insp.inspection_location || 'N/A'}</strong></div>
                      <div><small style="color:var(--text-muted);">Officer</small><br><strong>${insp.inspector_name || app.officer_name || 'N/A'}</strong></div>
                      <div><small style="color:var(--text-muted);">Photos</small><br><strong>${(insp.photos || []).length}</strong></div>
                    </div>
                    ${insp.results && insp.results.length ? `<div class="table-responsive"><table class="table" style="font-size:0.78rem; margin:0;"><thead><tr><th>Test Point</th><th>Standard</th><th>Observed</th><th>Error</th><th>Result</th></tr></thead><tbody>${insp.results.map(r => `<tr><td>${r.test_point}</td><td>${r.standard_value} ${r.unit || ''}</td><td>${r.observed_value} ${r.unit || ''}</td><td>${r.error_value ?? 'N/A'}${r.error_percentage !== null && r.error_percentage !== undefined ? ` (${r.error_percentage}%)` : ''}</td><td>${getStatusBadge(r.result === 'pass' ? 'verified' : 'rejected')}</td></tr>`).join('')}</tbody></table></div>` : '<div style="color:var(--text-muted); font-size:0.82rem;">No test measurements recorded yet.</div>'}

                    <div style="margin-top:16px;">
                      <h4 style="font-size:0.9rem; font-weight:700; color:var(--primary); margin:0 0 8px;"><i class="bi bi-camera-fill"></i> Inspection Photographs (${(insp.photos || []).length})</h4>
                      ${(insp.photos || []).length
                        ? `<div class="table-responsive"><table class="table" style="font-size:0.82rem; margin:0;"><thead><tr><th>Photograph</th><th>Caption</th><th>Uploaded</th><th style="text-align:right;">Actions</th></tr></thead><tbody>${(insp.photos || []).map((ph, index) => {
                            const filename = ph.stored_filename || ph.filename || '';
                            const caption = ph.caption || ph.original_filename || `Inspection photo ${index + 1}`;
                            const uploaded = ph.uploaded_at ? formatDateTime(ph.uploaded_at) : '—';
                            const safeFilename = String(filename).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                            return `<tr>
                              <td><strong>${ph.original_filename || ph.filename || `Photo ${index + 1}`}</strong></td>
                              <td>${caption}</td>
                              <td>${uploaded}</td>
                              <td style="text-align:right; white-space:nowrap;">
                                <button class="btn btn-outline btn-sm" onclick="Applications.viewInspectionPhoto('${safeFilename}')" title="Open full inspection photograph in a new tab">
                                  <i class="bi bi-eye"></i> View
                                </button>
                              </td>
                            </tr>`;
                          }).join('')}</tbody></table></div>`
                        : '<div style="color:var(--text-muted); font-size:0.82rem; font-style:italic;">No inspection photographs uploaded yet.</div>'}
                    </div>
                  </div>`
                : ''
            }

            ${
              app.certificate_number
                ? `<div style="background:#ECFDF5; border:1px solid #A7F3D0; padding:16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                      <div style="font-weight:700; color:#065F46;"><i class="bi bi-award-fill"></i> Official Digital Certificate Available</div>
                      <small style="color:#047857;">Certificate No: ${app.certificate_number} | Valid until ${formatDate(app.certificate_expiry_date)}</small>
                    </div>
                    <button class="btn btn-success" onclick="Certificates.downloadPDF('${app.certificate_number}')">
                      <i class="bi bi-file-earmark-pdf"></i> Download PDF
                    </button>
                   </div>`
                : ''
            }
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="App.closeModal()">Close Tracker</button>
          </div>
        </div>
      </div>
    `;
    App.setModal(timelineHtml);
  }
};
window.Applications = Applications;