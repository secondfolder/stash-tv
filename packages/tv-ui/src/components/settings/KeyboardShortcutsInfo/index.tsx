import React from "react";
import { Button } from "react-bootstrap";
import { Modal } from "../../containers/Modal";
import { MarkdownPage } from "stash-ui/dist/src/components/Shared/MarkdownPage";
import { useShortcutBindings } from "../../../hooks/useKeyboardShortcuts";
import { useGlobalState } from "../../../store/globalState";
import { shortcutHelpMarkdown } from "./help-text";
import "./KeyboardShortcutsInfo.css";

export const KeyboardShortcutsInfo: React.FC<{
  show: boolean;
  onHide: () => void;
}> = ({ show, onHide }) => {
  const bindings = useShortcutBindings();
  const { set: setGlobalState, ratingSystem } = useGlobalState();
  // MarkdownPage only takes a URL to fetch, so hand it the text as a data URL
  const pageUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(shortcutHelpMarkdown(bindings, ratingSystem))}`;

  const editShortcuts = () => {
    onHide();
    setGlobalState("settingsSection", "keyboard-shortcuts");
    setGlobalState("showSettings", true);
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      className="KeyboardShortcutsInfo"
      aria-labelledby="KeyboardShortcutsInfo-title"
    >
      <Modal.Header closeButton>
        <Modal.Title id="KeyboardShortcutsInfo-title">Keyboard Shortcuts</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* MarkdownPage only fetches once, so remount it if the content changes */}
        <MarkdownPage key={pageUrl} page={pageUrl} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={editShortcuts}>
          Edit shortcuts
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
