/**
 * Online Verification System - Officer Inspections & Digital Inspection Form Module
 */

const Inspections = {
  list: [],
  activeInspection: null,

  async loadInspections() {
    const container = document.getElementById('inspections-table-container');
    if (!container) return;

    container.innerHTML = '<div class="empty-state"><i class="bi bi-arrow-repeat spin"></i><p>Loading scheduled inspections...</p></div>';

    const res = await apiRequest('/inspections?limit=100');
    if (!res.ok) {
      container.innerHTML = `<div class="empty-state text-danger"><p>${res.data.error || 'Failed to load inspections.'}</p></div>`;
      return;
    }

    this.list = res.data.inspections || [];
    this.renderInspectionsTable();
  },

  renderInspectionsTable() {
    const container = document.getElementById('inspections-table-container');
    if (!container) return;

    if (this.list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-clipboard-check"></i>
          <h4>No inspections scheduled.</h4>
          <p>Assigned inspections scheduled by the officer will appear here.</p>
        </div>
      `;
      return;
    }

    const isOfficer = Auth.getRole() === 'officer';

    const rows = this.list.map(insp => `
      <tr>
        <td>
          <strong style="color:var(--primary); font-family:monospace; font-size:0.92rem;">
            ${insp.application_number}
          </strong>
        </td>
        <td>
          <div style="font-weight:600;">${insp.instrument_type}</div>
          <small style="color:var(--text-muted); font-family:monospace;">${insp.system_serial_number} (${insp.capacity} ${insp.unit_of_measurement})</small>
        </td>
        <td>
          <div>${insp.business_name || insp.applicant_name}</div>
          <small style="color:var(--text-muted);"><i class="bi bi-telephone"></i> ${insp.applicant_phone}</small>
        </td>
        <td>
          <div><i class="bi bi-calendar-event"></i> <strong>${formatDate(insp.scheduled_date)}</strong></div>
          <small style="color:var(--text-muted);"><i class="bi bi-clock"></i> ${insp.scheduled_time}</small>
        </td>
        <td>
          <div style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${insp.inspection_location}">
            <i class="bi bi-geo-alt"></i> ${insp.inspection_location}
          </div>
        </td>
        <td>${getStatusBadge(insp.status)}</td>
        <td style="text-align:right; white-space:nowrap;">
          ${
            isOfficer
              ? (() => {
                  const status = String(insp.status || '').trim().toLowerCase();
                  if (status === 'completed' || status === 'inspection_completed') {
                    return `<button class="btn btn-outline btn-sm" disabled aria-label="Inspection completed">
                              <i class="bi bi-check-circle-fill"></i> Inspection Completed
                            </button>`;
                  }
                  if (status === 'cancelled' || status === 'canceled') {
                    return `<button class="btn btn-outline btn-sm" disabled>
                              <i class="bi bi-x-circle-fill"></i> Inspection Cancelled
                            </button>`;
                  }
                  return `<button class="btn btn-primary btn-sm" onclick="Inspections.openDigitalForm(${insp.id})">
                            <i class="bi bi-pencil-square"></i> Conduct Inspection
                          </button>`;
                })()
              : `<button class="btn btn-outline btn-sm" onclick="Applications.viewTrackingModal(${insp.application_id})">
                  <i class="bi bi-eye"></i> View Details
                 </button>`
          }
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Application</th>
              <th>Instrument</th>
              <th>Applicant</th>
              <th>Schedule</th>
              <th>Location</th>
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
   * Schedule Inspection Modal (Officer only)
   */
  openScheduleModal(applicationId) {
    const today = new Date().toISOString().split('T')[0];

    const modalHtml = `
      <div class="modal-backdrop" id="schedule-modal" onclick="if(event.target===this) App.closeModal()">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3><i class="bi bi-calendar-plus-fill"></i> Schedule Physical Verification Inspection</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <form onsubmit="Inspections.handleScheduleSubmit(event, ${applicationId})">
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label>Scheduled Inspection Date <span class="required">*</span></label>
                  <input type="date" id="sched-date" class="form-control" min="${today}" required />
                </div>
                <div class="form-group">
                  <label>Scheduled Inspection Time <span class="required">*</span></label>
                  <input type="time" id="sched-time" class="form-control" value="10:00" required />
                </div>
              </div>

              <div class="form-group">
                <label>Physical Inspection Site Location <span class="required">*</span></label>
                <input type="text" id="sched-location" class="form-control" placeholder="Precise site or shop premises address" required />
              </div>

              <div class="form-group">
                <label>Inspector Remarks / Standard Weights Required</label>
                <textarea id="sched-remarks" class="form-control" rows="3" placeholder="e.g. Bring standard M1 class weights 20kg x 5 for load test. Ensure weighing berth is clean."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
              <button type="submit" class="btn btn-primary" id="btn-sched-submit">
                <i class="bi bi-calendar-check-fill"></i> Confirm & Notify Applicant
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    App.setModal(modalHtml);
  },

  async handleScheduleSubmit(e, applicationId) {
    e.preventDefault();
    const scheduled_date = document.getElementById('sched-date').value;
    const scheduled_time = document.getElementById('sched-time').value;
    const inspection_location = document.getElementById('sched-location').value.trim();
    const remarks = document.getElementById('sched-remarks').value.trim();
    const btn = document.getElementById('btn-sched-submit');

    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Scheduling...';

    const res = await apiRequest('/inspections', {
      method: 'POST',
      body: {
        application_id: applicationId,
        scheduled_date,
        scheduled_time,
        inspection_location,
        remarks
      }
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-calendar-check-fill"></i> Confirm & Notify Applicant';

    if (res.ok) {
      showToast('Inspection scheduled successfully! Applicant notified.', 'success');
      App.closeModal();
      if (window.OfficerDashboard) OfficerDashboard.loadDashboard();
      this.loadInspections();
    } else {
      showToast(res.data.error || 'Failed to schedule inspection.', 'danger');
    }
  },

  /**
   * Complete Digital Inspection Form
   */
  async openDigitalForm(inspectionId) {
    const res = await apiRequest(`/inspections/${inspectionId}`);
    if (!res.ok) {
      showToast(res.data.error || 'Failed to load inspection.', 'danger');
      return;
    }

    const insp = res.data.inspection;
    // The API returns photos alongside the inspection object, so normalize
    // them into activeInspection before rendering the form.
    const photos = Array.isArray(res.data.photos)
      ? res.data.photos
      : (Array.isArray(insp.photos) ? insp.photos : []);
    this.activeInspection = { ...insp, photos };
    const unit = insp.unit_of_measurement || 'kg';
    const capacityNum = parseFloat(insp.capacity) || 100;

    // Standard test points initialized dynamically based on capacity and unit
    let testPoints = insp.results && insp.results.length > 0
      ? insp.results
      : [
          { test_point: 'Zero Load Repeatability', standard_value: 0.0, observed_value: 0.0, permissible_error: 0.01, unit, result: 'pass', remarks: 'Zero return test' },
          { test_point: '25% Nominal Capacity Load Test', standard_value: (capacityNum * 0.25).toFixed(2), observed_value: (capacityNum * 0.25).toFixed(2), permissible_error: 0.02, unit, result: 'pass', remarks: 'Quarter load linearity' },
          { test_point: '50% Nominal Capacity Load Test', standard_value: (capacityNum * 0.5).toFixed(2), observed_value: (capacityNum * 0.5).toFixed(2), permissible_error: 0.05, unit, result: 'pass', remarks: 'Half capacity load' },
          { test_point: '100% Maximum Capacity Load Test', standard_value: capacityNum.toFixed(2), observed_value: capacityNum.toFixed(2), permissible_error: 0.1, unit, result: 'pass', remarks: 'Full scale maximum load' }
        ];

    this.activeInspection.currentTestPoints = testPoints;
    this.renderDigitalFormModal();
  },

  renderDigitalFormModal() {
    const insp = this.activeInspection;
    const unit = insp.unit_of_measurement || 'kg';
    const points = insp.currentTestPoints;
    const photos = insp.photos || [];

    const rowsHtml = points.map((p, idx) => {
      const std = parseFloat(p.standard_value) || 0;
      const obs = parseFloat(p.observed_value) || 0;
      const perm = parseFloat(p.permissible_error) || 0;
      const errVal = (obs - std).toFixed(4);
      const errPct = std !== 0 ? (((obs - std) / std) * 100).toFixed(2) : '0.00';
      const isPass = Math.abs(obs - std) <= (perm + 0.000001);

      return `
        <tr id="tp-row-${idx}">
          <td>
            <input type="text" class="form-control form-control-sm" value="${p.test_point}" onchange="Inspections.updateTestPoint(${idx}, 'test_point', this.value)" />
          </td>
          <td>
            <div style="display:flex; align-items:center; gap:4px;">
              <input type="number" step="any" class="form-control form-control-sm" value="${p.standard_value}" oninput="Inspections.calcTestPoint(${idx}, 'standard_value', this.value)" />
              <small>${unit}</small>
            </div>
          </td>
          <td>
            <div style="display:flex; align-items:center; gap:4px;">
              <input type="number" step="any" class="form-control form-control-sm" value="${p.observed_value}" oninput="Inspections.calcTestPoint(${idx}, 'observed_value', this.value)" />
              <small>${unit}</small>
            </div>
          </td>
          <td>
            <div style="display:flex; align-items:center; gap:4px;">
              <input type="number" step="any" class="form-control form-control-sm" value="${p.permissible_error}" oninput="Inspections.calcTestPoint(${idx}, 'permissible_error', this.value)" />
              <small>${unit}</small>
            </div>
          </td>
          <td style="font-family:monospace; font-size:0.85rem; font-weight:600;" id="tp-err-${idx}">
            ${errVal} ${unit} (${errPct}%)
          </td>
          <td id="tp-res-${idx}">
            <span class="badge ${isPass ? 'badge-success' : 'badge-danger'}">${isPass ? 'PASS' : 'FAIL'}</span>
          </td>
          <td>
            <input type="text" class="form-control form-control-sm" value="${p.remarks || ''}" placeholder="Remarks" onchange="Inspections.updateTestPoint(${idx}, 'remarks', this.value)" />
          </td>
          <td>
            <button type="button" class="btn btn-danger btn-sm" onclick="Inspections.removeTestPoint(${idx})">&times;</button>
          </td>
        </tr>
      `;
    }).join('');

    const photosHtml = photos.length > 0
      ? photos.map(ph => `
          <div style="position:relative; border:1px solid var(--border); border-radius:6px; overflow:hidden; background:#F8FAFC; text-align:center;">
            <img data-photo-filename="${ph.stored_filename}" class="photo-thumb protected-inspection-photo" alt="${ph.filename || ph.original_filename || 'Inspection photo'}" style="width:100%; height:120px; object-fit:cover;" />
            <div style="padding:4px; font-size:0.72rem; color:var(--text-muted);">${ph.caption || ph.filename || ph.original_filename || 'Inspection photo'}</div>
          </div>
        `).join('')
      : '<div style="color:var(--text-muted); font-size:0.82rem; font-style:italic;">No photographs uploaded yet.</div>';

    const modalHtml = `
      <div class="modal-backdrop" id="digital-insp-modal">
        <div class="modal-dialog modal-dialog-lg" style="max-width:960px;">
          <div class="modal-header">
            <h3><i class="bi bi-clipboard2-pulse-fill"></i> Digital Field Inspection Form</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <!-- Spec Band -->
            <div style="background:#0A2540; color:#FFFFFF; padding:14px 18px; border-radius:8px; display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:20px; font-size:0.82rem;">
              <div><span style="color:#94A3B8;">Instrument:</span> <br><strong>${insp.instrument_type}</strong></div>
              <div><span style="color:#94A3B8;">Serial Number:</span> <br><strong style="font-family:monospace; color:#FDE68A;">${insp.system_serial_number}</strong></div>
              <div><span style="color:#94A3B8;">Capacity & Unit:</span> <br><strong>${insp.capacity} ${unit}</strong></div>
              <div><span style="color:#94A3B8;">Accuracy Class:</span> <br><strong>${insp.accuracy_class}</strong></div>
              <div><span style="color:#94A3B8;">Manufacturer / Model:</span> <br><strong>${insp.manufacturer} (${insp.model_number})</strong></div>
              <div><span style="color:#94A3B8;">Applicant / Business:</span> <br><strong>${insp.business_name || insp.applicant_name}</strong></div>
            </div>

            <!-- Dynamic Test Points Grid -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <h4 style="font-size:0.95rem; font-weight:700; color:var(--primary); margin:0;">
                <i class="bi bi-speedometer2"></i> Statutory Test Point Measurements (${unit})
              </h4>
              <button type="button" class="btn btn-outline btn-sm" onclick="Inspections.addTestPoint()">
                <i class="bi bi-plus-lg"></i> Add Test Point
              </button>
            </div>

            <div class="table-responsive" style="margin-bottom:20px; border:1px solid var(--border); border-radius:6px;">
              <table class="table inspection-test-table" style="font-size:0.82rem;">
                <thead>
                  <tr>
                    <th style="width:25%;">Test Point</th>
                    <th style="width:16%;">Standard Value</th>
                    <th style="width:16%;">Observed Value</th>
                    <th style="width:15%;">Permissible Error</th>
                    <th style="width:14%;">Calculated Error</th>
                    <th style="width:8%;">Result</th>
                    <th style="width:15%;">Remarks</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>

            <!-- Photos Section -->
            <div style="border-top:1px solid var(--border); padding-top:16px; margin-bottom:16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h4 style="font-size:0.95rem; font-weight:700; color:var(--primary); margin:0;">
                  <i class="bi bi-camera-fill"></i> Inspection Photographs (Max 10 Images, Max 5MB Each)
                </h4>
              </div>

              <div class="form-row" style="margin-bottom:12px;">
                <div class="form-group" style="flex:1;">
                  <input type="file" id="insp-photo-input" class="form-control form-control-sm" accept=".jpg,.jpeg,.png,.webp" multiple />
                </div>
                <div class="form-group" style="flex:1;">
                  <input type="text" id="insp-photo-caption" class="form-control form-control-sm" placeholder="Optional Photo Caption" />
                </div>
                <div>
                  <button type="button" class="btn btn-secondary btn-sm" id="btn-upload-photo" onclick="Inspections.uploadPhotos(${insp.id})">
                    <i class="bi bi-cloud-arrow-up"></i> Upload Photos
                  </button>
                </div>
              </div>

              <div class="photo-preview-grid">
                ${photosHtml}
              </div>
            </div>

            <!-- General Inspector Remarks -->
            <div class="form-group" style="border-top:1px solid var(--border); padding-top:16px;">
              <label>Field Verification Summary & Stamp Remarks</label>
              <textarea id="insp-overall-remarks" class="form-control" rows="2" placeholder="Overall summary of physical condition, seal integrity, and test result conformance.">${insp.remarks || ''}</textarea>
            </div>
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            <div>
              <button type="button" class="btn btn-outline" onclick="App.closeModal()">Close Form</button>
            </div>
            <div style="display:flex; gap:10px;">
              <button type="button" class="btn btn-primary" id="btn-save-measurements" onclick="Inspections.saveTestPoints(${insp.id})">
                <i class="bi bi-save"></i> Save Test Results
              </button>
              <button type="button" class="btn btn-success" id="btn-complete-insp" onclick="Inspections.completeInspection(${insp.id})">
                <i class="bi bi-check-all"></i> Complete Inspection
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    App.setModal(modalHtml);
    this.loadProtectedPhotoPreviews(photos);
  },

  async loadProtectedPhotoPreviews(photos) {
    const token = Storage.getToken();
    if (!token || !photos.length) return;

    for (const photo of photos) {
      const img = document.querySelector(`img[data-photo-filename="${CSS.escape(photo.stored_filename)}"]`);
      if (!img) continue;
      try {
        const response = await fetch(`${CONFIG.API_BASE}/inspections/photo/${encodeURIComponent(photo.stored_filename)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Photo unavailable');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        img.src = url;
        img.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 60000), { once: true });
      } catch (err) {
        img.alt = 'Photo unavailable';
        img.style.opacity = '0.45';
      }
    }
  },

  calcTestPoint(idx, field, val) {
    const p = this.activeInspection.currentTestPoints[idx];
    p[field] = parseFloat(val) || 0;

    const std = parseFloat(p.standard_value) || 0;
    const obs = parseFloat(p.observed_value) || 0;
    const perm = parseFloat(p.permissible_error) || 0;
    const unit = this.activeInspection.unit_of_measurement || 'kg';

    const errVal = (obs - std).toFixed(4);
    const errPct = std !== 0 ? (((obs - std) / std) * 100).toFixed(2) : '0.00';
    const isPass = Math.abs(obs - std) <= (perm + 0.000001);
    p.result = isPass ? 'pass' : 'fail';

    const errEl = document.getElementById(`tp-err-${idx}`);
    const resEl = document.getElementById(`tp-res-${idx}`);
    if (errEl) errEl.innerText = `${errVal} ${unit} (${errPct}%)`;
    if (resEl) {
      resEl.innerHTML = `<span class="badge ${isPass ? 'badge-success' : 'badge-danger'}">${isPass ? 'PASS' : 'FAIL'}</span>`;
    }
  },

  updateTestPoint(idx, field, val) {
    this.activeInspection.currentTestPoints[idx][field] = val;
  },

  addTestPoint() {
    const unit = this.activeInspection.unit_of_measurement || 'kg';
    this.activeInspection.currentTestPoints.push({
      test_point: 'New Load Point',
      standard_value: 0,
      observed_value: 0,
      permissible_error: 0.05,
      unit,
      result: 'pass',
      remarks: ''
    });
    this.renderDigitalFormModal();
  },

  removeTestPoint(idx) {
    this.activeInspection.currentTestPoints.splice(idx, 1);
    this.renderDigitalFormModal();
  },

  async saveTestPoints(inspectionId) {
    const btn = document.getElementById('btn-save-measurements');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Saving...';

    const res = await apiRequest(`/inspections/${inspectionId}/results`, {
      method: 'POST',
      body: {
        test_points: this.activeInspection.currentTestPoints
      }
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-save"></i> Save Test Results';

    if (res.ok) {
      showToast('Measurements saved successfully.', 'success');
    } else {
      showToast(res.data.error || 'Failed to save measurements.', 'danger');
    }
  },

  async uploadPhotos(inspectionId) {
    const fileInput = document.getElementById('insp-photo-input');
    const caption = document.getElementById('insp-photo-caption').value.trim();
    const btn = document.getElementById('btn-upload-photo');

    if (!fileInput.files || fileInput.files.length === 0) {
      showToast('Please select photos to upload.', 'warning');
      return;
    }

    const formData = new FormData();
    formData.append('caption', caption);
    for (const file of fileInput.files) {
      formData.append('photos', file);
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Uploading...';

    const res = await apiRequest(`/inspections/${inspectionId}/photos`, {
      method: 'POST',
      body: formData
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-cloud-arrow-up"></i> Upload Photos';

    if (res.ok) {
      showToast('Inspection photos uploaded successfully.', 'success');
      // Reload inspection to show fresh photos
      this.openDigitalForm(inspectionId);
    } else {
      showToast(res.data.error || 'Failed to upload photos.', 'danger');
    }
  },

  async completeInspection(inspectionId) {
    // Ensure test points saved first
    await this.saveTestPoints(inspectionId);

    const remarks = document.getElementById('insp-overall-remarks').value.trim();
    const btn = document.getElementById('btn-complete-insp');

    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Completing...';

    const res = await apiRequest(`/inspections/${inspectionId}/complete`, {
      method: 'POST',
      body: { remarks }
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-all"></i> Complete Inspection';

    if (res.ok) {
      showToast('Digital inspection completed! You may now approve or reject the application.', 'success');
      App.closeModal();
      if (window.OfficerDashboard) OfficerDashboard.loadDashboard();
      this.loadInspections();
      // Prompt Officer to make final decision
      Certificates.openApprovalModal(this.activeInspection.application_id);
    } else {
      showToast(res.data.error || 'Failed to complete inspection.', 'danger');
    }
  }
};
window.Inspections = Inspections;