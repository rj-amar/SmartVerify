/**
 * Online Verification System - Officer Dashboard Module
 */

const OfficerDashboard = {
  stats: null,

  async loadDashboard() {
    const statsContainer = document.getElementById('officer-stats-container');
    if (!statsContainer) return;

    statsContainer.innerHTML = '<div class="empty-state"><i class="bi bi-arrow-repeat spin"></i><p>Loading assigned workload statistics...</p></div>';

    // Fetch assigned applications
    const appsRes = await apiRequest('/applications?limit=200');
    const inspRes = await apiRequest('/inspections?limit=200');

    if (!appsRes.ok || !inspRes.ok) {
      statsContainer.innerHTML = '<div class="empty-state text-danger"><p>Failed to load assigned workload metrics.</p></div>';
      return;
    }

    const apps = appsRes.data.applications || [];
    const insps = inspRes.data.inspections || [];

    const totalAssigned = apps.length;
    const pendingReview = apps.filter(a => a.status === 'submitted' || a.status === 'under_review').length;
    const scheduled = apps.filter(a => a.status === 'inspection_scheduled').length;
    const completed = apps.filter(a => a.status === 'inspection_completed').length;
    const verified = apps.filter(a => a.status === 'verified' || a.status === 'certificate_issued').length;
    const rejected = apps.filter(a => a.status === 'rejected').length;

    statsContainer.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon primary"><i class="bi bi-inbox-fill"></i></div>
          <div class="stat-details">
            <h3>${totalAssigned}</h3>
            <p>Assigned Applications</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon warning"><i class="bi bi-file-earmark-medical"></i></div>
          <div class="stat-details">
            <h3>${pendingReview}</h3>
            <p>Pending Document Reviews</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon info"><i class="bi bi-calendar2-week-fill"></i></div>
          <div class="stat-details">
            <h3>${scheduled}</h3>
            <p>Scheduled Inspections</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon primary"><i class="bi bi-check2-circle"></i></div>
          <div class="stat-details">
            <h3>${completed}</h3>
            <p>Completed Inspections</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon success"><i class="bi bi-patch-check-fill"></i></div>
          <div class="stat-details">
            <h3>${verified}</h3>
            <p>Approved / Verified</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon danger"><i class="bi bi-x-octagon-fill"></i></div>
          <div class="stat-details">
            <h3>${rejected}</h3>
            <p>Rejected Applications</p>
          </div>
        </div>
      </div>
    `;

    // Render Recent Assigned Applications in Dashboard
    const assignedTableContainer = document.getElementById('officer-assigned-table-container');
    if (assignedTableContainer) {
      if (apps.length === 0) {
        assignedTableContainer.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><h4>No applications assigned yet.</h4><p>Applications submitted in your district will be automatically allocated to you.</p></div>';
      } else {
        const rows = apps.slice(0, 10).map(a => `
          <tr>
            <td><strong style="color:var(--primary); font-family:monospace;">${a.application_number}</strong></td>
            <td>${a.instrument_type} <small style="color:var(--text-muted);">(${a.capacity} ${a.unit_of_measurement})</small></td>
            <td>${a.business_name || a.applicant_name}</td>
            <td><i class="bi bi-geo-alt"></i> ${a.inspection_district}</td>
            <td>${getStatusBadge(a.status)}</td>
            <td style="text-align:right;">
              ${
                a.status === 'submitted' || a.status === 'under_review'
                  ? `<button class="btn btn-primary btn-sm" onclick="Inspections.openScheduleModal(${a.id})"><i class="bi bi-calendar-plus"></i> Schedule</button>`
                  : ''
              }
              ${
                a.status === 'inspection_scheduled'
                  ? (() => {
                      const scheduledInspection = insps.find(i => Number(i.application_id) === Number(a.id) && i.status === 'scheduled');
                      return scheduledInspection
                        ? `<button class="btn btn-primary btn-sm" onclick="Inspections.openDigitalForm(${scheduledInspection.id})"><i class="bi bi-pencil-square"></i> Inspect</button>`
                        : `<button class="btn btn-primary btn-sm" onclick="Inspections.openDigitalFormForApplication(${a.id})"><i class="bi bi-pencil-square"></i> Inspect</button>`;
                    })()
                  : ''
              }
              ${
                a.status === 'inspection_completed'
                  ? `<button class="btn btn-success btn-sm" onclick="openOfficerFinalDecision(${a.id})"><i class="bi bi-patch-check"></i> Decide</button>`
                  : ''
              }
              <button class="btn btn-outline btn-sm" style="margin-left:4px;" onclick="Applications.viewTrackingModal(${a.id})"><i class="bi bi-eye"></i></button>
            </td>
          </tr>
        `).join('');

        assignedTableContainer.innerHTML = `
          <div class="table-responsive">
            <table class="table" style="font-size:0.85rem;">
              <thead>
                <tr><th>Application No.</th><th>Instrument</th><th>Applicant</th><th>District</th><th>Status</th><th style="text-align:right;">Action</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
      }
    }
  },

  async openDigitalFormForApplication(applicationId) {
    const res = await apiRequest('/inspections?limit=200');
    if (!res.ok) {
      showToast(res.data.error || 'Unable to load inspections.', 'danger');
      return;
    }
    const inspection = (res.data.inspections || []).find(i => Number(i.application_id) === Number(applicationId));
    if (!inspection) {
      showToast('No inspection record exists for this application.', 'danger');
      return;
    }
    Inspections.openDigitalForm(inspection.id);
  }
};
window.OfficerDashboard = OfficerDashboard;

// Robust officer decision entry point used by dashboard action buttons.
function openOfficerFinalDecision(applicationId) {
  const id = Number(applicationId);
  if (!Number.isFinite(id) || id <= 0) {
    showToast('Invalid Application', 'Could not identify this application.', 'danger');
    return;
  }
  if (!window.Certificates || typeof window.Certificates.openApprovalModal !== 'function') {
    console.error('Certificates.openApprovalModal is unavailable.');
    showToast('Decision Unavailable', 'Certificate module is still loading. Please refresh the page.', 'danger');
    return;
  }
  window.Certificates.openApprovalModal(id);
}
