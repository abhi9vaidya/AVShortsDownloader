// apiClient.js - Drop this file into your frontend project

class ShortsDownloaderAPI {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
  }

  /**
   * Fetch video information and metadata
   * @param {string} url - YouTube video/shorts URL
   * @returns {Promise<Object>} Video information
   */
  async getVideoInfo(url) {
    try {
      const response = await fetch(`${this.baseURL}/api/video-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch video info');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching video info:', error);
      throw error;
    }
  }

  /**
   * Download video directly to user's device
   * @param {string} url - YouTube video/shorts URL
   * @param {string} quality - Video quality (default: 'highest')
   * @param {Function} onProgress - Optional progress callback
   * @returns {Promise<void>}
   */
  async downloadVideo(url, quality = 'highest', onProgress = null) {
    try {
      const response = await fetch(`${this.baseURL}/api/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, quality }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to download video');
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'video.mp4';
      if (contentDisposition) {
        const matches = /filename="(.+)"/.exec(contentDisposition);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }

      // Handle progress if reader is supported
      const reader = response.body.getReader();
      const contentLength = +response.headers.get('Content-Length');
      
      let receivedLength = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        
        if (onProgress && contentLength) {
          const progress = (receivedLength / contentLength) * 100;
          onProgress(progress);
        }
      }

      // Create blob and download
      const blob = new Blob(chunks);
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      return { success: true, filename };
    } catch (error) {
      console.error('Error downloading video:', error);
      throw error;
    }
  }

  /**
   * Download video to server
   * @param {string} url - YouTube video/shorts URL
   * @param {string} quality - Video quality (default: 'highest')
   * @returns {Promise<Object>} Download result
   */
  async downloadToServer(url, quality = 'highest') {
    try {
      const response = await fetch(`${this.baseURL}/api/download-to-server`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, quality }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to download video');
      }

      return await response.json();
    } catch (error) {
      console.error('Error downloading to server:', error);
      throw error;
    }
  }

  /**
   * Download audio only from video
   * @param {string} url - YouTube video/shorts URL
   * @param {Function} onProgress - Optional progress callback
   * @returns {Promise<void>}
   */
  async downloadAudio(url, onProgress = null) {
    try {
      const response = await fetch(`${this.baseURL}/api/download-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to download audio');
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'audio.mp3';
      if (contentDisposition) {
        const matches = /filename="(.+)"/.exec(contentDisposition);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }

      // Handle progress
      const reader = response.body.getReader();
      const contentLength = +response.headers.get('Content-Length');
      
      let receivedLength = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        
        if (onProgress && contentLength) {
          const progress = (receivedLength / contentLength) * 100;
          onProgress(progress);
        }
      }

      // Create blob and download
      const blob = new Blob(chunks);
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      return { success: true, filename };
    } catch (error) {
      console.error('Error downloading audio:', error);
      throw error;
    }
  }

  /**
   * Get list of downloaded files on server
   * @returns {Promise<Array>} List of files
   */
  async getDownloadedFiles() {
    try {
      const response = await fetch(`${this.baseURL}/api/downloads`);

      if (!response.ok) {
        throw new Error('Failed to fetch downloads');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching downloads:', error);
      throw error;
    }
  }

  /**
   * Delete a file from server
   * @param {string} filename - Name of file to delete
   * @returns {Promise<Object>} Delete result
   */
  async deleteFile(filename) {
    try {
      const response = await fetch(`${this.baseURL}/api/downloads/${filename}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete file');
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  /**
   * Check API health
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseURL}/health`);
      return await response.json();
    } catch (error) {
      console.error('Error checking health:', error);
      throw error;
    }
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ShortsDownloaderAPI;
}

// Example usage:
/*
// Initialize the API client
const api = new ShortsDownloaderAPI('http://localhost:3000');

// Get video information
const videoInfo = await api.getVideoInfo('https://youtube.com/shorts/VIDEO_ID');
console.log(videoInfo);

// Download video with progress tracking
await api.downloadVideo(
  'https://youtube.com/shorts/VIDEO_ID',
  'highest',
  (progress) => console.log(`Download progress: ${progress.toFixed(2)}%`)
);

// Download audio only
await api.downloadAudio('https://youtube.com/shorts/VIDEO_ID');

// Get all downloaded files
const files = await api.getDownloadedFiles();
console.log(files);

// Delete a file
await api.deleteFile('video-name-123456.mp4');
*/