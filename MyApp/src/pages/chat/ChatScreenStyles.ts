import { StyleSheet } from 'react-native';

/* =============== styles =============== */
export const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DBE5E0',
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#7EA896',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
  },
  headBtn: { width: 28, alignItems: 'center' },
  headTitle: { fontSize: 16, fontWeight: '800', flex: 1 },

  // Pinned & typing bars
  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#DBE5E0',
    backgroundColor: '#F2F6F4',
  },
  typingBar: { paddingHorizontal: 14, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },

  // Empty
  fullScreenEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIcon: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 28, fontWeight: '800', marginBottom: 8, textAlign: 'center' },

  // Message row
  row: { paddingHorizontal: 12, paddingVertical: 0, alignItems: 'flex-end' },
  avatar: {
    width: 32, height: 32, borderRadius: 16, marginHorizontal: 6,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, elevation: 1,
  },
  avatarSpace: { width: 28, height: 28, marginHorizontal: 6 },

  // ชื่อผู้ส่ง
  nameText: { fontSize: 12, fontWeight: '700', marginBottom: 2, color: '#374151' },
  adminPrefixText: { color: '#4ADE80' },
  superAdminPrefixText: { color: '#FCA5A5' },

  timeText: { fontSize: 10, color: '#718096' },

  imageWrapNoFrame: { overflow: 'hidden', borderRadius: 8 },
  imageNoFrame: { width: 240, minHeight: 220, maxHeight: 280, backgroundColor: '#E8ECEA' },
  messageContentWrap: {
    maxWidth: '78%',
  },
  messageContentWrapFile: {
    width: '78%',
  },

  messageBubble: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  messageBubbleFile: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    width: '100%',
    borderRadius: 16,
  },
  messageBubbleVideo: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
    borderRadius: 0,
  },
  messageText: { fontSize: 15, lineHeight: 21, color: '#314049' },
  messageLinkText: {
    color: '#1D4ED8',
    textDecorationLine: 'underline',
  },

  // wrapper เธชเธณเธซเธฃเธฑเธเนเธญเธเธญเธเนเธเธฃเนเธ—เธตเนเธญเธขเธนเนเธเธญเธเธเธฑเธเน€บิล
  bubbleWithShareWrap: { position: 'relative', width: '100%' },
  shareFabOutside: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -14 }],
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#DEE4E1',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },

  fileCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DEE4E1',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
  fileCardPdf: {
    width: '100%',
  },
  fileCardPdfFull: {
    backgroundColor: 'transparent',
    borderColor: '#D6E2DB',
    borderWidth: 0,
    borderRadius: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    minWidth: 0,
  },
  fileIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F1',
    borderWidth: 1,
    borderColor: '#D9E2DE',
  },
  fileIconBadgePdf: {
    backgroundColor: '#E8F2EE',
    borderColor: '#CAE0D6',
  },
  fileIconBadgePdfLarge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2EDE8',
    borderWidth: 1,
    borderColor: '#C4DDD2',
  },
  fileTextCol: {
    flex: 1,
    minWidth: 0,
  },
  fileTextColPdf: {
    flex: 1,
    minWidth: 0,
  },
  fileNameText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    color: '#24323A',
  },
  fileNameTextPdf: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    color: '#24323A',
  },
  fileMetaLinePdf: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  fileDownloadDocxBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E6F0EB',
    borderWidth: 1,
    borderColor: '#C7DCD2',
  },
  fileSizeTextPdf: {
    fontSize: 12,
    color: '#6A757C',
    fontWeight: '400',
  },
  fileMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  fileTypePill: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: '#DCECE5',
    borderWidth: 1,
    borderColor: '#C4DDD2',
  },
  fileTypePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3F6D5C',
    letterSpacing: 0.2,
  },
  fileSizeText: {
    fontSize: 12,
    color: '#6A757C',
  },
  fileOpenTouch: {
    width: '100%',
    alignSelf: 'stretch',
  },
  videoPreviewTouch: {
    width: '100%',
    alignSelf: 'stretch',
  },
  videoPreviewCard: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  videoPreviewPressArea: {
    width: '100%',
  },
  videoPreviewBackdrop: {
    height: 292,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121C26',
    overflow: 'hidden',
  },
  videoPreviewImage: {
    ...StyleSheet.absoluteFillObject,
  },
  videoPreviewFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#17222D',
  },
  videoPreviewGhostIcon: {
    opacity: 0.95,
  },
  videoPreviewShade: {
    ...StyleSheet.absoluteFillObject,
  },
  videoPlayButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9, 14, 19, 0.52)',
    borderWidth: 1,
    borderColor: 'rgba(240, 248, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 3,
  },
  videoDurationChip: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  videoDurationChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  videoUploadingBarWrap: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 9,
    backgroundColor: '#0C141C',
    borderTopWidth: 1,
    borderTopColor: '#22303B',
  },
  videoUploadingBarTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: '#233340',
    overflow: 'hidden',
  },
  videoUploadingBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#84B8A2',
  },
  videoUploadingText: {
    marginTop: 4,
    color: '#B5C5D1',
    fontSize: 10,
    fontWeight: '600',
  },

  // Day divider
  dayRow: { alignItems: 'center', marginTop: 10, marginBottom: 6 },
  dayChip: { fontSize: 13, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 24 },

  // Composer
  composerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { padding: 6 },
  inputPill: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#DBE5E0',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 2,
    backgroundColor: '#FFFFFF',
  },
  inputText: { fontSize: 16, paddingVertical: 10 },
  sendFab: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    elevation: 3,
    shadowColor: '#7EA896',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  imageCaption: { fontSize: 14, lineHeight: 20, marginTop: 6, paddingHorizontal: 2 },
  timeContainer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1, marginHorizontal: 2 },
  
  // Reaction badge
  reactionBadge: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#DEE4E1',
  },
  reactionChipMine: {
    backgroundColor: '#E5F3EC',
    borderColor: '#BFDCCD',
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 11,
    color: '#6B7280',
    marginLeft: 3,
    fontWeight: '600',
  },
});


