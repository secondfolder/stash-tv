import React, { ReactNode } from "react";
import Select, { SelectProps } from "../Select";
import { components, GroupBase, MenuListProps, OptionProps, SingleValueProps } from "react-select";

type IconOption = { label: ReactNode };

function GridMenuList<Option, IsMulti extends boolean, Group extends GroupBase<Option>>(props: MenuListProps<Option, IsMulti, Group>) {
  return (
    <components.MenuList {...props}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(50px, 1fr))',
        gap: '8px',
        padding: '8px'
      }}>
        {props.children}
      </div>
    </components.MenuList>
  );
}

function GridOption<Option extends IconOption, IsMulti extends boolean, Group extends GroupBase<Option>>(props: OptionProps<Option, IsMulti, Group>) {
  return (
    <components.Option {...props}>
      {props.data.label}
    </components.Option>
  );
}

function GridSingleValue<Option extends IconOption, IsMulti extends boolean, Group extends GroupBase<Option>>(props: SingleValueProps<Option, IsMulti, Group>) {
  return (
    <components.SingleValue {...props}>
      <div style={{ display: 'flex', alignItems: 'center', margin: '0.5em 0.1em', height: '30px' }}>
        {props.data.label}
      </div>
    </components.SingleValue>
  );
}

export function IconSelect<Option extends IconOption, IsMulti extends boolean = false, Group extends GroupBase<Option> = GroupBase<Option>>(
  props: SelectProps<Option, IsMulti, Group>
) {
  return (
    <Select<Option, IsMulti, Group>
      {...props}
      inputId="button-icon"
      components={{
        MenuList: GridMenuList,
        Option: GridOption,
        SingleValue: GridSingleValue,
        ...props.components
      }}
    />
  )
}
