# Ego Rock

This is an [Obsidian](https://obsidian.md) plugin that allows viewing [taskwarrior](https://taskwarrior.org/) tasks in Obsidian's reading view. This plugin requires a functional, externally installed taskwarrior installation.

## Reports
### Task tables
To include a table of tasks, use a `task-table` code block. The text inside the code block is parsed as YAML; include a key called `command` with the taskwarrior command that should be executed to generate the table. The syntax for this is exactly the same as the taskwarrior CLI syntax except that:

- The report name must be the last token, and will not be defaulted if not provided. For example, `task +nonsense list` is legal, but `task list +nonsense` and `task +nonsense` are not.
- Some overrides are provided so the resulting ascii table can be parsed to an HTML table; `rc.detection` is set to `off`, and `rc.defaultWidth` is set to `1000`.

A basic use-case might look like:
````
```task-table
command: task list
```
````

You can use [custom reports](https://taskwarrior.org/docs/report/#custom-reports) as well as all of taskwarrior's [filter expressions](https://taskwarrior.org/docs/filter/):
````
```task-table
command: task /.*ing$/ or +work custom-report
```
````

You can also provide [command line overrides](https://taskwarrior.org/docs/configuration/#command-line-override); these are often useful for setting a context for a report or modifying a report's presentation when used in Obsidian (but not via the command line):
````
```task-table
command: task rc.context:home rc.report.list.filter:"status:pending" list
```
````

### Task counts
To include a _count_ of the number of tasks, use a `task-count` code block. The text inside is parsed the same as a `task-table` code block.
````
```task-count
command: task rc.context:home rc.report.list.filter:"status:pending" list
```
````

### ASCII task tables
To include an ASCII table of tasks, use a `task-table-ascii` code block. The text inside is parsed the same as a `task-table` code block, except that the output is rendered as monospace ASCII instead of as an HTML table. You will likely need to include an override for the defaultWidth so lines are not wrapped; 80 appears to work for most situations.
````
```task-table-ascii
command: task rc.defaultwidth:80 project:home list
```
````

## Report actions
Action buttons can be added to the `task-table` report. To include action buttons, add a list of enabled actions to the report's configuration under the key `actions`. Currently, the only supported action is refresh. Action buttons will be created in the order they are listed.

````
```task-table
command: task rc.defaultwidth:80 project:home list
actions:
  - refresh
```
````

## Developer Guide
### Releasing new releases
- Commit your changes with a useful commit message that does not mention versioning.
- Run `npm version <patch|minor|major>`.
- Run `git push && git push $VERSION_TAG`.

### Improve code quality with eslint (optional)
- [ESLint](https://eslint.org/) is a tool that analyzes your code to quickly find problems. You can run ESLint against your plugin to find common bugs and ways to improve your code.
- To use eslint with this project, make sure to install eslint from terminal:
  - `npm install -g eslint`
- To use eslint to analyze this project use this command:
  - `eslint main.ts`
  - eslint will then create a report with suggestions for code improvement by file and line number.
- If your source code is in a folder, such as `src`, you can use eslint with this command to analyze all files in that folder:
  - `eslint .\src\`
