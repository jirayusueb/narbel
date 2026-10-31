import { Button } from "@narbel/ui/components/button";
import { Spinner } from "@narbel/ui/components/spinner";
import { Upload } from "lucide-react";
import { useRef } from "react";

import { useImportBoard } from "../model/use-import-board";

export const ImportBoardButton = () => {
  const input = useRef<HTMLInputElement>(null);
  const { importFile, isPending } = useImportBoard();
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".excalidraw,.json,application/json"
        className="hidden"
        aria-label="Import an .excalidraw file"
        tabIndex={-1}
        onChange={(e) => {
          const [file] = e.target.files ?? [];
          // cleared so choosing the same file again after a failure still fires
          e.target.value = "";
          if (file) {
            importFile(file);
          }
        }}
      />
      <Button
        variant="secondary"
        isDisabled={isPending}
        onPress={() => input.current?.click()}
      >
        {isPending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <Upload data-icon="inline-start" />
        )}
        Import
      </Button>
    </>
  );
};
