import React, { useRef, useState } from "react";
import { useResizeObserver } from "../../../../hooks/useResizeObserver";
import cx from "classnames";
import { Button } from "react-bootstrap";
import { Tag } from "../../../tags/tag";
import { TagPopover } from "../../../entity-popovers/TagPopover";
import { OptionsOf, toggle } from "../field-options";
import { defineField, Field, SceneInfoFieldProps } from "./shared";
import { getStashUrl } from "../../../../helpers/getStashOrigin";

const schema = {
  /** Whether every tag is always shown, rather than cut short until "Show N more" is clicked */
  showAll: toggle(false, {
    label: "Always show every tag",
    description: "Otherwise only 2 rows of tags are shown, with a button below them showing the rest.",
  }),
};

/** How many rows of tags are shown until "Show N more" is clicked, unless they're all always shown */
const tagRowCount = 2;

/** The fewest tags worth hiding: a button showing fewer would take about as much room as they do */
const minHiddenTags = 2;

type TagRow = { top: number; bottom: number };

/** The rows a wrapping list's items are on, from where they're laid out (relative to the list, which is positioned) */
function measureRows(list: HTMLElement): TagRow[] {
  const rows: TagRow[] = [];
  for (const item of list.children) {
    if (!(item instanceof HTMLElement)) continue;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    const row = rows[rows.length - 1];
    if (row && top < row.bottom) row.bottom = Math.max(row.bottom, bottom);
    else rows.push({ top, bottom });
  }
  return rows;
}

/** Where the tags are cut short: the bottom of the last row shown, and how many tags are after it */
type TagCut = { bottom: number; hidden: number };

function TagsField({ scene, options, preview, onExternalLinkClick }: SceneInfoFieldProps<OptionsOf<typeof schema>>) {
  const [expanded, setExpanded] = useState(false);
  // Where they're cut short, if there are enough tags after the rows shown to be worth hiding
  const [cut, setCut] = useState<TagCut | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const capping = !options.showAll && !expanded;
  // While capping, where to cut them short. Not capping, it's not used (see `capped`), and it's measured again before
  // they're shown capped again.
  useResizeObserver(() => listRef.current, () => {
    const list = listRef.current;
    if (!list) return;
    const lastRow = measureRows(list)[tagRowCount - 1];
    const hidden = lastRow ? [...list.children].filter(tag => tag instanceof HTMLElement && tag.offsetTop >= lastRow.bottom).length : 0;
    const next = lastRow && hidden >= minHiddenTags ? { bottom: lastRow.bottom, hidden } : null;
    setCut(previous => previous?.bottom === next?.bottom && previous?.hidden === next?.hidden ? previous : next);
  }, { enabled: capping, deps: [scene.tags] });
  if (!scene.tags.length) return null;
  const capped = capping && cut;
  const showMore = capped && `Show ${cut.hidden} more`;
  return <Field field={fieldDefinition} className={cx({ capped })}>
    {/* Cut short after the last row shown, every row shown in full */}
    <div ref={listRef} className="tag-list" style={capped ? { maxHeight: cut.bottom } : undefined}>
      {scene.tags.map(tag => preview
        ? <Tag key={tag.id} tag={tag} />
        // Opens the tag's popover, or with a modifier key (or middle click), the tag in Stash
        : <TagPopover key={tag.id} tag={tag} onOpenInStash={onExternalLinkClick}>
          {triggerProps => <a href={getStashUrl(`/tags/${tag.id}`)} target="_blank" {...triggerProps}>
            <Tag tag={tag} />
          </a>}
        </TagPopover>
      )}
    </div>
    {capped && (preview
      ? <span className="show-more btn btn-link btn-sm">{showMore}</span>
      : <Button variant="link" size="sm" className="show-more" onClick={() => setExpanded(true)}>{showMore}</Button>
    )}
  </Field>
}

export const fieldDefinition = defineField({ id: "tags", label: "Tags", component: TagsField, options: schema });
