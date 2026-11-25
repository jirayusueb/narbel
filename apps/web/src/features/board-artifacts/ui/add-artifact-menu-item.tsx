import { MainMenu } from "@narbel/ndraw";
import { FileCode } from "lucide-react";

export const AddArtifactMenuItem = ({ onSelect }: { onSelect: () => void }) => (
  <MainMenu.Item icon={<FileCode />} onSelect={onSelect}>
    Add artifact…
  </MainMenu.Item>
);
