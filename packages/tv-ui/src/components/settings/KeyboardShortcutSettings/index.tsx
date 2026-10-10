import React, { useState } from "react";
import { Badge, Button, Form } from "react-bootstrap";
import { PlusLg, XLg } from "react-bootstrap-icons";
import { useTvConfig } from "../../../store/tvConfig";
import { useGlobalState } from "../../../store/globalState";
import { useShortcutBindings } from "../../../hooks/useKeyboardShortcuts";
import {
  defaultShortcutBindings,
  describeClashes,
  findClashingBindings,
  heldWithKeys,
  withActionBindings,
} from "../../../helpers/keyboard-shortcuts/definitions";
import {
  getShortcutAction,
  SHORTCUT_ACTION_IDS,
  SHORTCUT_GROUPS,
  type ShortcutActionId,
} from "../../../helpers/shortcut-actions/actions";
import { formatKeySequence, type KeySequence } from "../../../helpers/keyboard-shortcuts/key-sequences";
import { describeClashRemoval, ShortcutRecorder } from "../ShortcutRecorder";
import { ShortcutKeys } from "../ShortcutKeys";
import "./KeyboardShortcutSettings.scss";

/**
 * The settings for every keyboard shortcut: each action's key sequences, which can be removed, added or changed by
 * typing them into a command palette (`ShortcutRecorder`), or reset to the defaults.
 *
 * @see docs/keyboard-shortcuts.md § "Changing shortcuts"
 */
export function KeyboardShortcutSettings() {
  const { keyboardShortcuts: overrides, forceLandscape, set: setTvConfig } = useTvConfig();
  const { ratingSystem } = useGlobalState();
  const bindings = useShortcutBindings();

  /** The binding whose keys are being typed: a new one for an action (no sequence), or one being changed */
  const [editing, setEditing] = useState<{ actionId: ShortcutActionId, sequence: KeySequence | null } | null>(null);
  /** A note under an action about the last change to it */
  const [notice, setNotice] = useState<{ actionId: ShortcutActionId, message: string } | null>(null);

  const setBindings = (changes: [ShortcutActionId, readonly KeySequence[]][]) => {
    setTvConfig("keyboardShortcuts", (previous) =>
      changes.reduce((result, [actionId, sequences]) => withActionBindings(result, actionId, sequences, ratingSystem), previous)
    );
  };

  /** Give an action a sequence typed: a new one, or in place of the one being changed */
  const save = (actionId: ShortcutActionId, replacing: KeySequence | null, sequence: KeySequence) => {
    const others = bindings[actionId].filter((other) => other !== replacing);
    if (others.includes(sequence)) {
      setBindings([[actionId, others]]);
      setNotice(null);
      return;
    }
    const own = replacing
      ? bindings[actionId].map((other) => other === replacing ? sequence : other)
      : [...bindings[actionId], sequence];
    // Keys can only do one thing, and a sequence starting another would stop the other ever being typed, so they're
    // taken from whatever had them
    const clashes = findClashingBindings({ ...bindings, [actionId]: own }, ratingSystem, actionId, sequence);
    const changed = new Map<ShortcutActionId, readonly KeySequence[]>([[actionId, own]]);
    for (const clash of clashes) {
      const current = changed.get(clash.actionId) ?? bindings[clash.actionId];
      changed.set(clash.actionId, current.filter((other) => other !== clash.sequence));
    }
    setBindings([...changed]);
    setNotice(clashes.length
      ? {
        actionId,
        message: clashes.map((clash) => describeClashRemoval(clash, { actionId, sequence }, ratingSystem, bindings, "was")).join(" "),
      }
      : null);
  };

  const clashes = describeClashes(bindings, ratingSystem);

  return <>
    {editing && <ShortcutRecorder
      actionId={editing.actionId}
      initial={editing.sequence}
      bindings={bindings}
      ratingSystem={ratingSystem}
      onSave={(sequence) => {
        save(editing.actionId, editing.sequence, sequence);
        setEditing(null);
      }}
      onClose={() => setEditing(null)}
    />}
    {SHORTCUT_GROUPS.map((group) => {
      const groupActions = SHORTCUT_ACTION_IDS.filter((actionId) =>
        getShortcutAction(actionId).group === group
        // Its keys are pressed while holding another action's, which has none, so it can't be used (e.g. the seek speed
        // without seek keys)
        && heldWithKeys(actionId, bindings)?.length !== 0
      );
      return <Form.Group key={group} className="KeyboardShortcutSettings">
        <Form.Label as="h4">{group}</Form.Label>
        <ul className="shortcut-list">
          {groupActions.map((actionId) => {
            const { title } = getShortcutAction(actionId);
            return <li key={actionId} className="shortcut" data-action={actionId}>
              <span className="shortcut-title">{title}</span>
              <span className="shortcut-keys">
                {bindings[actionId].map((sequence) => {
                  const keys = formatKeySequence(sequence);
                  return <Badge key={sequence} className="tag-item shortcut-key" variant="secondary">
                    <Button
                      variant="link"
                      className="shortcut-key-label"
                      aria-label={`Change ${keys} for "${title}"`}
                      onClick={() => {
                        setNotice(null);
                        setEditing({ actionId, sequence });
                      }}
                    >
                      <ShortcutKeys actionId={actionId} sequence={sequence} ratingSystem={ratingSystem} bindings={bindings} />
                    </Button>
                    <Button
                      aria-label={`Remove ${keys} from "${title}"`}
                      onClick={() => {
                        setBindings([[actionId, bindings[actionId].filter((other) => other !== sequence)]]);
                        setNotice(null);
                      }}
                    >
                      <XLg />
                    </Button>
                  </Badge>;
                })}
                <Button
                  className="add-key"
                  variant="secondary"
                  size="sm"
                  aria-label={`Add a key for "${title}"`}
                  onClick={() => {
                    setNotice(null);
                    setEditing({ actionId, sequence: null });
                  }}
                >
                  <PlusLg />
                </Button>
                {overrides[actionId] && <Button
                  className="reset"
                  variant="link"
                  size="sm"
                  aria-label={`Reset "${title}" to default`}
                  onClick={() => {
                    setBindings([[actionId, defaultShortcutBindings(actionId, ratingSystem)]]);
                    setNotice(null);
                  }}
                >
                  Reset
                </Button>}
              </span>
              {notice?.actionId === actionId && <Form.Text className="text-warning shortcut-notice" role="status">
                {notice.message}
              </Form.Text>}
              {clashes[actionId]?.map((clash) => <Form.Text key={clash} className="text-warning shortcut-notice">
                {clash}
              </Form.Text>)}
            </li>;
          })}
        </ul>
      </Form.Group>;
    })}
    {Object.keys(overrides).length > 0 && <Form.Group className="inline">
      <Button
        variant="outline-warning"
        onClick={() => {
          setTvConfig("keyboardShortcuts", {});
          setNotice(null);
        }}
      >
        Reset all to default
      </Button>
    </Form.Group>}
  </>;
}
