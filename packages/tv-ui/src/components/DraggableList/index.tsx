import React, { ReactNode, useCallback, useRef, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import "./DraggableList.css"
import cx, {Argument as ClassNameArgs} from "classnames";

type GetDragHandleProps = (props?: {className?: ClassNameArgs}) => { onPointerDown: (e: React.PointerEvent) => void }
type RenderItemProps<Item> = {
  item: Item,
  items: Item[],
  getDragHandleProps: GetDragHandleProps,
  nestedChildren: ReactNode,
  currentNestingParent: Item | null,
  nextNestingParent: Item | null,
  previousNestingParent: Item | null,
  updateList: (newList: Item[]) => void,
}
const draggableClassName = "draggable";

function DraggableListItem<Item>({
  item,
  items,
  renderItem,
  children,
  currentNestingParent,
  nextNestingParent,
  previousNestingParent,
  updateList,
}: {
  item: Item,
  items: Item[],
  renderItem: (props: RenderItemProps<Item>) => ReactNode,
  children?: ReactNode,
  currentNestingParent: Item | null,
  nextNestingParent: Item | null,
  previousNestingParent: Item | null,
  updateList: (newList: Item[]) => void,
}) {
  const controls = useDragControls();

  const [dragHandleInUse, setDragHandleInUse] = useState(false);
  const getDragHandleProps = useCallback(
    (props?: {className?: ClassNameArgs}) => {
      if (!dragHandleInUse) setDragHandleInUse(true);
      return {
        className: cx(draggableClassName, props?.className),
        onPointerDown: (e: React.PointerEvent) => controls.start(e)
      }
    },
    [controls, dragHandleInUse, setDragHandleInUse]
  );

  return (
    <Reorder.Item
      value={item}
      className={cx({[draggableClassName]: !dragHandleInUse})}
      dragListener={!dragHandleInUse}
      dragControls={controls}
    >
      {renderItem({
        item,
        items,
        getDragHandleProps,
        nestedChildren: children,
        currentNestingParent,
        nextNestingParent,
        previousNestingParent,
        updateList,
      })}
    </Reorder.Item>
  );
}

function DraggableList<Item>(
  {
    className,
    items,
    onItemsOrderChange,
    renderItem,
    getItemKey,
    nestingKey,
    _nestingParent = null,
  }: {
    className?: ClassNameArgs,
    items: Item[],
    onItemsOrderChange: (newOrder: Item[]) => void,
    renderItem: (props: RenderItemProps<Item>) => ReactNode,
    getItemKey: (item: Item) => string,
    nestingKey?: string,
    _nestingParent?: Item | null,
  }
) {
  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={onItemsOrderChange}
      className={cx("DraggableList", className)}
    >
      {items.map((item, index) => {
        let nestedList: Item[] | null = null;
        let nextNestingParent = null
        let previousNestingParent = null
        if (nestingKey) {
          nextNestingParent = items.find((listItem, listIndex) => (
            listIndex > index && listItem && typeof listItem === "object" && Array.isArray(
              // @ts-expect-error -- We can be sure at this point that listItem has nestingKey but it's not easy to type
              listItem[nestingKey]
            )
          )) ?? null
          previousNestingParent = items.filter((listItem, listIndex) => (
            listIndex < index && listItem && typeof listItem === "object" && Array.isArray(
              // @ts-expect-error -- same as with nextNestingParent
              listItem[nestingKey]
            )
          )).at(-1) ?? null
          if (typeof item === "object" && item !== null) {
            const itemObject = item as unknown as Record<typeof nestingKey, unknown>;
            if (nestingKey in itemObject && itemObject[nestingKey] && Array.isArray(itemObject[nestingKey])) {
              nestedList = itemObject[nestingKey] as Item[];
            }
          }
          if (nestedList) {
            const onNestedItemsOrderChange = (newOrder: Item[]) => {
              const nestingParentId = getItemKey(item);
              onItemsOrderChange(
                items.map((topLevelItem) => {
                  if (getItemKey(topLevelItem) === nestingParentId) {
                    return {...topLevelItem, [nestingKey]: newOrder};
                  }
                  return topLevelItem;
                })
              );
            }
            return (
              <DraggableListItem<Item>
                key={getItemKey(item)}
                item={item}
                items={items}
                renderItem={renderItem}
                currentNestingParent={_nestingParent}
                nextNestingParent={nextNestingParent}
                previousNestingParent={previousNestingParent}
                updateList={onItemsOrderChange}
              >
                <DraggableList
                  className={cx("nested-draggable-list")}
                  items={nestedList}
                  onItemsOrderChange={onNestedItemsOrderChange}
                  renderItem={renderItem}
                  getItemKey={getItemKey}
                  _nestingParent={item}
                />
              </DraggableListItem>
            )
          }
        }
        return (
          <DraggableListItem<Item>
            key={getItemKey(item)}
            item={item}
            items={items}
            renderItem={renderItem}
            currentNestingParent={_nestingParent}
            nextNestingParent={nextNestingParent}
            previousNestingParent={previousNestingParent}
            updateList={onItemsOrderChange}
          />
        )
      })}
    </Reorder.Group>
  )
}

export default DraggableList;
