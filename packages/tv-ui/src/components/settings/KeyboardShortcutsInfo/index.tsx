import React from "react";
import { Modal } from "../../containers/Modal";
import { MarkdownPage } from "stash-ui/dist/src/components/Shared/MarkdownPage";
import content from "./KeyboardShortcutsInfo.md?url";
import "./KeyboardShortcutsInfo.css";

export const KeyboardShortcutsInfo: React.FC<{
  show: boolean;
  onHide: () => void;
}> = ({ show, onHide }) => {
  return (
    <Modal
      show={show}
      onHide={onHide}
      className="KeyboardShortcutsInfo"
    >
      <Modal.Header closeButton>
        <Modal.Title>Keyboard Shortcuts</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <MarkdownPage page={content} />
      </Modal.Body>
    </Modal>
  );
}
