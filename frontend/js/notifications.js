/**
 * Online Verification System - Notifications Module
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
          <div style="padding:12px 14px; border-bottom:1px solid var(--border); background:${n.is_read ? '#FFFFFF' : '#F0F9FF'}; display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
            <div style="flex:1;">
              <div style="font-weight:700; font-size:0.88rem; color:${n.is_read ? 'var(--text-primary)' : 'var(--secondary)'}; display:flex; align-items:center; gap:6px;">
                ${!n.is_read ? '<span style="width:8px; height:8px; border-radius:50%; background:var(--secondary); display:inline-block;"></span>' : ''}
                ${n.title}
              </div>
              <p style="font-size:0.82rem; color:var(--text-secondary); margin:4px 0 6px;">${n.message}</p>
              <small style="font-size:0.72rem; color:var(--text-muted);"><i class="bi bi-clock"></i> ${formatDateTime(n.created_at)}</small>
            </div>
            ${
              !n.is_read
                ? `<button class="btn btn-outline btn-sm" onclick="Notifications.markRead(${n.id})" title="Mark as Read" style="padding:2px 6px;">
                    <i class="bi bi-check"></i>
                   </button>`
                : ''
            }
          </div>
        `).join('')
      : '<div class="empty-state"><i class="bi bi-bell-slash"></i><h4>No notifications</h4><p>You have no notifications at this time.</p></div>';

    const modalHtml = `
      <div class="modal-backdrop" id="notif-modal" onclick="if(event.target===this) App.closeModal()">
        <div class="modal-dialog" style="max-height:80vh;">
          <div class="modal-header">
            <h3><i class="bi bi-bell-fill"></i> System Notifications (${this.unreadCount} Unread)</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <div class="modal-body" style="padding:0; max-height:480px; overflow-y:auto;">
            ${notifsHtml}
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            ${
              this.unreadCount > 0
                ? `<button class="btn btn-outline btn-sm" onclick="Notifications.markAllRead()">
                    <i class="bi bi-check-all"></i> Mark All as Read
                   </button>`
                : '<div></div>'
            }
            <button class="btn btn-primary btn-sm" onclick="App.closeModal()">Close</button>
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
