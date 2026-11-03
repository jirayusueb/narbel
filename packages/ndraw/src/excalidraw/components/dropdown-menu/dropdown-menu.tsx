import React from "react";
import DropdownMenuTrigger from "./dropdown-menu-trigger";
import DropdownMenuItem from "./dropdown-menu-item";
import MenuSeparator from "./dropdown-menu-separator";
import DropdownMenuGroup from "./dropdown-menu-group";
import DropdownMenuContent from "./dropdown-menu-content";
import DropdownMenuItemLink from "./dropdown-menu-item-link";
import DropdownMenuItemCustom from "./dropdown-menu-item-custom";
import {
  getMenuContentComponent,
  getMenuTriggerComponent,
} from "./dropdown-menu-utils";

import "./dropdown-menu.css";

const DropdownMenu = ({
  children,
  open,
}: {
  children?: React.ReactNode;
  open: boolean;
}) => {
  const MenuTriggerComp = getMenuTriggerComponent(children);
  const MenuContentComp = getMenuContentComponent(children);
  return (
    <>
      {MenuTriggerComp}
      {open && MenuContentComp}
    </>
  );
};

DropdownMenu.Trigger = DropdownMenuTrigger;
DropdownMenu.Content = DropdownMenuContent;
DropdownMenu.Item = DropdownMenuItem;
DropdownMenu.ItemLink = DropdownMenuItemLink;
DropdownMenu.ItemCustom = DropdownMenuItemCustom;
DropdownMenu.Group = DropdownMenuGroup;
DropdownMenu.Separator = MenuSeparator;

export default DropdownMenu;

DropdownMenu.displayName = "DropdownMenu";
