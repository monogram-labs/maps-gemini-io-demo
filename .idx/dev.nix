# To learn more about how to use Nix to configure your environment
# see: https://developers.google.com/idx/guides/customize-idx-env
{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-23.11"; # or "unstable"
  # Use https://search.nixos.org/packages to find packages
  packages = [pkgs.nodejs];
  # Sets environment variables in the workspace
  env = {};
  idx = {
    workspace.onCreate = {
      npm-install = "npm install";
    };
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      "esbenp.prettier-vscode"
    ];
    # Enable previews and customize configuration
    previews = {
      enable = true;
      previews = [
        {
          command = ["npm" "run" "dev" "--" "--port" "$PORT" "--host" "0.0.0.0"];
          manager = "web";
          id = "web";
        }
      ];
    };
  };
}
