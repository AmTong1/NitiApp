import React from 'react';
import { Modal, StatusBar, StyleSheet, View } from 'react-native';
import ChatScreen from './ChatScreen';

type ChatRoom = {
  id: number;
  name: string;
  room_type: 'public' | 'dm';
};

type ChatRoomModalProps = {
  visible: boolean;
  room: ChatRoom | null;
  onClose: () => void;
};

const ChatRoomModal: React.FC<ChatRoomModalProps> = ({ visible, room, onClose }) => {
  if (!visible || !room) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />
      <View style={styles.container}>
        <ChatScreen initialRoom={room} onBack={onClose} />
      </View>
    </Modal>
  );
};

function areEqual(prev: ChatRoomModalProps, next: ChatRoomModalProps) {
  return (
    prev.visible === next.visible &&
    prev.onClose === next.onClose &&
    prev.room?.id === next.room?.id &&
    prev.room?.name === next.room?.name &&
    prev.room?.room_type === next.room?.room_type
  );
}

export default React.memo(ChatRoomModal, areEqual);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
