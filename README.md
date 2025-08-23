# TabOutX

Tab out of quotes, brackets and more in Visual Studio Code.

> Forked from [TabOut](https://github.com/albertromkes/tabout/).

## Features

- Tab out of quotes, brackets and cusomtoms, including multicharacter ones.
- Tab out backward with `Shift+Tab`.
- Multiline support: jump from the end of a line to the next line which starts with a specific pair.

<img src="https://raw.githubusercontent.com/gaspardruan/taboutx/refs/heads/main/assets/taboutx-show.gif">

## Configuration

Settings > Search "taboutx". And you can customize the pairs you want to tab out of by editing the settings.json file.
Below click the "Edit in settings.json" link to open the file.

<img src="https://raw.githubusercontent.com/gaspardruan/taboutx/refs/heads/main/assets/taboutx-setting.png">

## Key Bindings Conflict

TaboutX has the lowest priority, so if you have other extensions that use the `Tab` or `Shift+Tab` key bindings,
you may need to change their key bindings to avoid conflicts. How to configure key bindings in VS Code:

1. Go to File > Preferences > Keyboard Shortcuts (or press `Ctrl+K Ctrl+S`).
2. Search "taboutx" or "taboutxBack".
3. Right-click on the command and select "Change Keybinding".
4. Press the new key combination you want to use and click "OK".

But in the end, you will find that `Tab` is still the best key binding for this extension.
