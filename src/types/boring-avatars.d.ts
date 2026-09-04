declare module "boring-avatars" {
  import * as React from "react";

  export interface AvatarProps {
    size?: number | string;
    name?: string;
    square?: boolean;
    variant?: "marble" | "beam" | "pixel" | "sunset" | "ring" | "bauhaus";
    colors?: string[];
  }

  const Avatar: React.FC<AvatarProps>;
  export default Avatar;
}
