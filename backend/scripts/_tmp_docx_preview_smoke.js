(async () => {
  const fs = require('fs-extra');
  const { resolveDocxPreviewByInput } = require('../src/utils/docPreview');
  try {
    const info = await resolveDocxPreviewByInput('/uploads/1775041016612_f9mp1rot64.docx', { waitForCompletion: true });
    if (!info) {
      console.log('PREVIEW_NOT_READY');
      return;
    }
    const exists = await fs.pathExists(info.previewAbsPath);
    const st = exists ? await fs.stat(info.previewAbsPath) : null;
    console.log('PREVIEW_OK', JSON.stringify({
      previewUrl: info.previewUrl,
      previewAbsPath: info.previewAbsPath,
      exists,
      size: st ? Number(st.size || 0) : 0,
    }));
  } catch (e) {
    console.error('PREVIEW_SMOKE_ERR', e.message || e);
  }
})();
