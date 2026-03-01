import React, { ReactNode } from "react";
import Select from "../Select";
import { components, MenuListProps, OptionProps, SingleValueProps } from "react-select";


export const IconSelect: typeof Select = (props) => {
  const GridMenuList = (props: MenuListProps<unknown>) => {
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
  };

  const GridOption = (props: OptionProps<{label: ReactNode}>) => {
    return (
      <components.Option {...props}>
        {props.data.label}
      </components.Option>
    );
  };

  const GridSingleValue = (props: SingleValueProps<{label: ReactNode}>) => {
    return (
      <components.SingleValue {...props}>
        <div style={{ display: 'flex', alignItems: 'center', margin: '0.5em 0.1em', height: '30px' }}>
          {props.data.label}
        </div>
      </components.SingleValue>
    );
  };

  return (
    <Select
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
