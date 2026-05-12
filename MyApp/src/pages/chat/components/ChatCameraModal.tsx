import React from 'react';
import type { Asset } from 'react-native-image-picker';
import ChatCameraVisionModal from './ChatCameraVisionModal';

type ChatCameraModalProps = {
  visible: boolean;
  onClose: () => void;
  onCapture: (asset: Asset) => void;
};

const ChatCameraModal: React.FC<ChatCameraModalProps> = ({
  visible,
  onClose,
  onCapture,
}) => (
  <ChatCameraVisionModal
    visible={visible}
    onClose={onClose}
    onCapture={onCapture}
  />
);

export default React.memo(ChatCameraModal);
