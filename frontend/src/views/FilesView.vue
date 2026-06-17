<template>
  <div class="files-view pa-4">
    <div class="d-flex align-center mb-4">
      <h2 class="text-h5 font-weight-bold">📁 Tất cả Files & Media</h2>
      <v-spacer />
      <v-text-field
        v-model="search"
        prepend-inner-icon="mdi-magnify"
        placeholder="Tìm theo tên file hoặc khách hàng..."
        variant="outlined"
        density="compact"
        hide-details
        class="search-input"
        clearable
        @update:model-value="onSearch"
      />
    </div>

    <!-- Filter tabs -->
    <v-tabs v-model="activeTab" color="primary" class="mb-4" density="compact">
      <v-tab value="all">Tất cả</v-tab>
      <v-tab value="image">🖼️ Ảnh</v-tab>
      <v-tab value="video">🎥 Video</v-tab>
      <v-tab value="pdf">📄 PDF</v-tab>
      <v-tab value="file">📎 Tài liệu</v-tab>
    </v-tabs>

    <!-- Loading -->
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <!-- Empty state -->
    <div v-if="!loading && files.length === 0" class="text-center py-12">
      <v-icon size="64" color="grey-lighten-1">mdi-file-search-outline</v-icon>
      <div class="text-h6 text-grey mt-4">Không tìm thấy file nào</div>
      <div class="text-body-2 text-grey">Gửi file/ảnh trong chat để xem tại đây</div>
    </div>

    <!-- File grid -->
    <div v-else class="files-grid">
      <div
        v-for="file in files"
        :key="file.id"
        class="file-item"
        @click="openPreview(file)"
      >
        <!-- Thumbnail -->
        <div class="file-thumb">
          <!-- Image thumbnail -->
          <img
            v-if="file.contentType === 'image' && file.href"
            :src="getProxyUrl(file, true)"
            :alt="file.name"
            class="thumb-img"
            loading="lazy"
          />
          <!-- Video thumbnail -->
          <div v-else-if="file.contentType === 'video'" class="thumb-video">
            <v-icon size="48" color="white">mdi-play-circle-outline</v-icon>
          </div>
          <!-- PDF icon -->
          <div v-else-if="file.contentType === 'pdf'" class="thumb-pdf">
            <v-icon size="48" color="#e53935">mdi-file-pdf-box</v-icon>
          </div>
          <!-- Generic file icon -->
          <div v-else class="thumb-file">
            <v-icon size="48" color="#1976d2">mdi-file-document-outline</v-icon>
          </div>
        </div>

        <!-- Info -->
        <div class="file-info">
          <div class="file-name" :title="file.name">{{ file.name }}</div>
          <div class="file-meta">
            <span v-if="file.sizeFormatted" class="file-size">{{ file.sizeFormatted }}</span>
            <a class="file-contact" :title="'Mở chat với ' + file.contactName" @click.stop="goToChat(file)">
              {{ file.contactName }}
            </a>
          </div>
          <div class="file-date">{{ formatDate(file.sentAt) }}</div>
        </div>

        <!-- Action buttons -->
        <v-btn icon size="x-small" variant="text" class="file-chat-btn" :title="'Mở chat'" @click.stop="goToChat(file)">
          <v-icon size="16">mdi-message-text-outline</v-icon>
        </v-btn>
        <v-btn icon size="x-small" variant="text" class="file-dl-btn" :title="'Tải xuống'" @click.stop="downloadFile(file)">
          <v-icon size="16">mdi-download</v-icon>
        </v-btn>
      </div>
    </div>

    <!-- Load more -->
    <div v-if="hasMore" class="text-center mt-4">
      <v-btn variant="outlined" :loading="loadingMore" @click="loadMore">
        Xem thêm
      </v-btn>
    </div>

    <!-- Image lightbox -->
    <v-dialog v-model="showLightbox" max-width="95vw" content-class="elevation-0">
      <div class="lightbox-wrap" @click.self="showLightbox = false">
        <v-btn icon size="small" class="lb-close" variant="text" @click="showLightbox = false">
          <v-icon size="24">mdi-close</v-icon>
        </v-btn>
        <img
          v-if="previewFile?.contentType === 'image'"
          :src="getProxyUrl(previewFile, true)"
          class="lb-img"
          @click.stop
        />
        <iframe
          v-else-if="previewFile?.contentType === 'pdf'"
          :src="getProxyUrl(previewFile, true)"
          class="lb-iframe"
        />
        <div v-else class="lb-file-info">
          <v-icon size="64" color="info">mdi-file-document-outline</v-icon>
          <div class="text-h6 mt-4">{{ previewFile?.name }}</div>
          <div class="text-body-2 text-grey mt-2">{{ previewFile?.sizeFormatted }}</div>
          <div class="text-body-2 text-grey mt-1">Từ: {{ previewFile?.contactName }}</div>
          <div class="d-flex gap-2 justify-center mt-4">
            <v-btn color="primary" variant="outlined" @click="previewFile && goToChat(previewFile)">
              <v-icon left>mdi-message-text-outline</v-icon> Mở chat
            </v-btn>
            <v-btn color="primary" @click="downloadFile(previewFile!)">
              <v-icon left>mdi-download</v-icon> Tải xuống
            </v-btn>
          </div>
        </div>
      </div>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/index';

const router = useRouter();

interface FileItem {
  id: string;
  name: string;
  href: string;
  size: number;
  sizeFormatted: string;
  contentType: string;
  ext: string;
  conversationId: string;
  contactName: string;
  contactId: string;
  senderName: string;
  sentAt: string;
}

const files = ref<FileItem[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const activeTab = ref('all');
const search = ref('');
const page = ref(1);
const total = ref(0);
const limit = 40;
const showLightbox = ref(false);
const previewFile = ref<FileItem | null>(null);

let searchTimer: ReturnType<typeof setTimeout> | null = null;

const hasMore = ref(false);

function getProxyUrl(file: FileItem, inline = false): string {
  const href = file.href;
  if (href.startsWith('http') && (href.includes('zdn.vn') || href.includes('zaloapp.com') || href.includes('zalocontent.com') || href.includes('dlfl.vn'))) {
    const base = `/api/v1/conversations/${file.conversationId}/attachments/download?url=${encodeURIComponent(href)}&name=${encodeURIComponent(file.name)}`;
    return inline ? `${base}&inline=1` : base;
  }
  const minioMatch = href.match(/http:\/\/localhost:9000\/zalocrm-attachments\/(.+)/);
  if (minioMatch) return `/attachments/${minioMatch[1]}`;
  return href;
}

function goToChat(file: FileItem) {
  if (file.conversationId) {
    router.push(`/chat/${file.conversationId}`);
  }
}

function downloadFile(file: FileItem) {
  window.open(getProxyUrl(file), '_blank');
}

function openPreview(file: FileItem) {
  if (file.contentType === 'image' || file.contentType === 'pdf') {
    previewFile.value = file;
    showLightbox.value = true;
  } else if (file.contentType === 'video') {
    window.open(getProxyUrl(file), '_blank');
  } else {
    previewFile.value = file;
    showLightbox.value = true;
  }
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

async function fetchFiles(reset = false) {
  if (reset) {
    page.value = 1;
    files.value = [];
  }
  const type = activeTab.value;
  const params: any = { type, page: page.value, limit };
  if (search.value) params.search = search.value;

  if (reset) loading.value = true;
  else loadingMore.value = true;

  try {
    const res = await api.get('/files', { params });
    if (reset) {
      files.value = res.data.files;
    } else {
      files.value.push(...res.data.files);
    }
    total.value = res.data.total;
    hasMore.value = res.data.files.length >= limit;
  } catch (err) {
    console.error('[files] fetch error:', err);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function loadMore() {
  page.value++;
  fetchFiles();
}

function onSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => fetchFiles(true), 300);
}

watch(activeTab, () => fetchFiles(true));

onMounted(() => fetchFiles(true));
</script>

<style scoped>
.files-view {
  max-width: 1200px;
  margin: 0 auto;
}
.search-input {
  max-width: 320px;
}
.files-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.file-item {
  position: relative;
  border: 1px solid var(--smax-grey-200, #ebedf0);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s;
  background: #fff;
}
.file-item:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  transform: translateY(-2px);
}
.file-item:hover .file-dl-btn {
  opacity: 1;
}
.file-thumb {
  width: 100%;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f6fa;
  overflow: hidden;
}
.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-video {
  background: #37474f;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb-pdf {
  background: #ffebee;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb-file {
  background: #e3f2fd;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.file-info {
  padding: 8px 10px;
}
.file-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--smax-text, #1a1a2e);
}
.file-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}
.file-size {
  font-size: 11px;
  color: #999;
}
.file-contact {
  font-size: 11px;
  color: #1976d2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
  cursor: pointer;
  text-decoration: none;
}
.file-contact:hover {
  text-decoration: underline;
  color: #1565c0;
}
.file-date {
  font-size: 11px;
  color: #bbb;
  margin-top: 2px;
}
.file-dl-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  opacity: 0;
  transition: opacity 0.15s;
  background: rgba(255,255,255,0.85) !important;
}
.file-chat-btn {
  position: absolute;
  top: 4px;
  right: 30px;
  opacity: 0;
  transition: opacity 0.15s;
  background: rgba(255,255,255,0.85) !important;
}
.file-item:hover .file-chat-btn {
  opacity: 1;
}

/* Lightbox */
.lightbox-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}
.lb-close {
  position: absolute;
  top: 8px;
  right: 8px;
  color: #fff !important;
  background: rgba(0,0,0,0.4) !important;
  z-index: 1;
  border-radius: 50% !important;
}
.lb-img {
  max-width: 100%;
  max-height: 85vh;
  border-radius: 8px;
  object-fit: contain;
}
.lb-iframe {
  width: 90vw;
  height: 85vh;
  border: none;
  border-radius: 8px;
  background: #525659;
}
.lb-file-info {
  text-align: center;
  padding: 32px;
  color: #fff;
}
</style>
