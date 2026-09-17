/**
 * Online Verification System - Notifications Module
 * Real-Time Statutory Alerts & Updates
 */

const Notifications = {
  unreadCount: 0,
  list: [],

  async fetchUnreadCount() {
    if (!Auth.isLoggedIn()) return;
    const res = await apiRequest('/notifications?limit=5');
    if (res.ok) {
      this.unreadCount = res.data.unread_count || 0;
      this.updateBadge();
    }
  },

  updateBadge() {
    const badge = document.getElementById('notif-unread-badge');
    if (!badge) return;
    if (this.unreadCount > 0) {
      badge.innerText = this.unreadCount > 99 ? '99+' : this.unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  },

  async openPanel() {
    const res = await apiRequest('/notifications?limit=30');
    if (!res.ok) {
      showToast('Failed to load notifications.', 'danger');
      return;
    }

    this.list = res.data.notifications || [];
    this.unreadCount = res.data.unread_count || 0;
    this.updateBadge();

    const notifsHtml = this.list.length > 0
      ? this.list.map(n => `
          <div style="padding:14px 18px; border-bottom:1px solid var(--border-color); background:${n.is_read ? '#FFFFFF' : '#F0F9FF'}; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; transition:var(--transition-fast);">
            <div style="flex:1;">
              <div style="font-weight:700; font-size:0.88rem; color:${n.is_read ? 'var(--text-primary)' : 'var(--primary-blue)'}; display:flex; align-items:center; gap:8px;">
                ${!n.is_read ? '<span style="width:8px; height:8px; border-radius:50%; background:var(--primary-blue); display:inline-block; flex-shrink:0;"></span>' : ''}
                ${n.title}
              </div>
              <p style="font-size:0.84rem; color:var(--text-secondary); margin:4px 0 6px; line-height:1.5;">${n.message}</p>
              <small style="font-size:0.74rem; color:var(--text-muted); display:flex; align-items:center; gap:4px;"><i class="bi bi-clock"></i> ${formatDateTime(n.created_at)}</small>
            </div>
            ${
              !n.is_read
                ? `<button class="btn btn-outline btn-sm" onclick="Notifications.markRead(${n.id})" title="Mark as Read" style="padding:4px 8px; font-size:0.75rem;">
                    <i class="bi bi-check2"></i> Read
                   </button>`
                : ''
            }
          </div>
        `).join('')
      : `
        <div class="empty-state" style="padding:36px 20px;">
          <i class="bi bi-bell-slash"></i>
          <h4>No notifications</h4>
          <p>You are completely up to date with your metrology tasks.</p>
        </div>
      `;

    const modalHtml = `
      <div class="modal-backdrop" id="notif-modal" onclick="if(event.target===this) App.closeModal()">
        <div class="modal-dialog" style="max-height:85vh; max-width:560px;">
          <div class="modal-header">
            <h3><i class="bi bi-bell-fill" style="color:var(--primary-blue);"></i> Statutory Notifications (${this.unreadCount} Unread)</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <div class="modal-body" style="padding:0; max-height:480px; overflow-y:auto;">
            ${notifsHtml}
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            <div>
              ${
                this.unreadCount > 0
                  ? `<button class="btn btn-outline btn-sm" onclick="Notifications.markAllRead()">
                      <i class="bi bi-check-all"></i> Mark All as Read
                     </button>`
                  : '<div></div>'
              }
            </div>
            <button class="btn btn-secondary btn-sm" onclick="App.closeModal()">Close</button>
          </div>
        </div>
      </div>
    `;
    App.setModal(modalHtml);
  },

  async markRead(id) {
    const res = await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' });
    if (res.ok) {
      if (this.unreadCount > 0) this.unreadCount--;
      this.updateBadge();
      this.openPanel();
    }
  },

  async markAllRead() {
    const res = await apiRequest('/notifications/read-all', { method: 'PATCH' });
    if (res.ok) {
      this.unreadCount = 0;
      this.updateBadge();
      this.openPanel();
    }
  }
};

window.Notifications = Notifications;
