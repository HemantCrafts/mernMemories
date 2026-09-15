import api from './client.js';

export const authApi = {
  register: (payload) => api.post('/auth/register', payload),
  login: (payload) => api.post('/auth/login', payload),
  me: () => api.get('/auth/me'),
};

export const postsApi = {
  /** list({ page, author, feed }) */
  list: (params = {}) => api.get('/posts', { params }),
  get: (id) => api.get(`/posts/${id}`),
  create: (payload) => api.post('/posts', payload),
  update: (id, payload) => api.patch(`/posts/${id}`, payload),
  remove: (id) => api.delete(`/posts/${id}`),
  toggleLike: (id) => api.post(`/posts/${id}/like`),
  comments: (id) => api.get(`/posts/${id}/comments`),
  addComment: (id, content) => api.post(`/posts/${id}/comments`, { content }),
  removeComment: (postId, commentId) =>
    api.delete(`/posts/${postId}/comments/${commentId}`),
};

export const usersApi = {
  list: (params = {}) => api.get('/users', { params }),
  get: (username) => api.get(`/users/${username}`),
  updateMe: (payload) => api.patch('/users/me', payload),
  toggleFollow: (id) => api.post(`/users/${id}/follow`),
};

export const uploadsApi = {
  /**
   * Uploads a single image file.
   *
   * Content-Type is deliberately NOT set here: the browser must generate the
   * multipart boundary itself. Overriding it produces a malformed request.
   *
   * @param {File} file
   * @param {(percent: number) => void} [onProgress]
   */
  upload(file, onProgress) {
    const form = new FormData();
    form.append('image', file);

    return api.post('/uploads', form, {
      headers: { 'Content-Type': undefined },
      transformRequest: [(data, headers) => {
        // Let the browser set the multipart headers, boundary included.
        delete headers['Content-Type'];
        return data;
      }],
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.round((event.loaded * 100) / event.total));
      },
    });
  },
};
