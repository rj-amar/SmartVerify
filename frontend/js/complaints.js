/**
 * SmartVerify - Public Consumer Complaints
 */
const Complaints = {
  async submit(event) {
    event.preventDefault();

    const form = document.getElementById('consumer-complaint-form');
    const button = document.getElementById('complaint-submit-btn');
    const success = document.getElementById('complaint-success');
    if (!form || !button) return;

    const data = Object.fromEntries(new FormData(form).entries());
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Submitting Complaint...';
    if (success) success.style.display = 'none';

    try {
      const res = await apiRequest('/complaints', {
        method: 'POST',
        body: data
      });

      if (!res.ok) {
        showToast(res.data?.error || 'Unable to submit the complaint.', 'danger');
        return;
      }

      const complaint = res.data?.complaint;
      form.reset();
      if (success) {
        success.innerHTML = `
          <div class="complaint-success-icon"><i class="bi bi-check-lg"></i></div>
          <div>
            <span class="public-kicker">Submission received</span>
            <h3>Complaint submitted successfully</h3>
            <p>Your complaint has been received and is pending review.</p>
            <div class="complaint-reference-box">
              <span>Complaint Reference</span>
              <strong>${escapeHtml(complaint?.complaint_reference || 'Generated successfully')}</strong>
            </div>
            <p class="complaint-save-note"><i class="bi bi-info-circle"></i> Keep this reference number to track your complaint later.</p>
            <button type="button" class="btn btn-outline" onclick="Complaints.startNew()"><i class="bi bi-plus-circle"></i> File Another Complaint</button>
          </div>`;
        success.style.display = 'flex';
        success.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      showToast('Complaint submitted successfully.', 'success');
    } catch (err) {
      console.error('[Complaint Submit Error]:', err);
      showToast('Unable to submit the complaint. Please try again.', 'danger');
    } finally {
      button.disabled = false;
      button.innerHTML = originalText;
    }
  },

  startNew() {
    const success = document.getElementById('complaint-success');
    const form = document.getElementById('consumer-complaint-form');
    if (success) success.style.display = 'none';
    if (form) form.reset();
    form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  async track() {
    const input = document.getElementById('complaint-track-reference');
    const result = document.getElementById('complaint-track-result');
    if (!input || !result) return;

    const reference = input.value.trim().toUpperCase();
    if (!/^CMP-\d{4}-\d{6}$/.test(reference)) {
      result.innerHTML = '<div class="track-message track-error"><i class="bi bi-exclamation-circle"></i> Enter a valid complaint reference.</div>';
      return;
    }

    result.innerHTML = '<div class="track-message"><i class="bi bi-arrow-repeat spin"></i> Checking status...</div>';
    const res = await apiRequest(`/complaints/${encodeURIComponent(reference)}`, { method: 'GET' });

    if (!res.ok) {
      result.innerHTML = `<div class="track-message track-error"><i class="bi bi-exclamation-circle"></i> ${escapeHtml(res.data?.error || 'Complaint not found.')}</div>`;
      return;
    }

    const complaint = res.data.complaint;
    const statusLabel = this.statusLabel(complaint.status);
    result.innerHTML = `
      <div class="track-result-card">
        <div class="track-result-top"><strong>${escapeHtml(complaint.complaint_reference)}</strong><span class="badge badge-primary">${escapeHtml(statusLabel)}</span></div>
        <div class="track-meta"><span>Instrument</span><strong>${escapeHtml(complaint.instrument_type || 'Not specified')}</strong></div>
        <div class="track-meta"><span>Submitted</span><strong>${this.formatDate(complaint.created_at)}</strong></div>
      </div>`;
  },

  statusLabel(status) {
    const labels = {
      submitted: 'Submitted',
      under_review: 'Under Review',
      assigned: 'Assigned',
      inspection_required: 'Inspection Required',
      resolved: 'Resolved',
      closed: 'Closed'
    };
    return labels[status] || 'Submitted';
  },

  formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
};

window.Complaints = Complaints;
