import { Plugin, parseYaml, PluginSettingTab, Setting, App } from 'obsidian';
import { execSync }  from 'child_process'

interface Settings {
	taskBinaryPath: string;
}

const DEFAULT_SETTINGS: Settings = {
	taskBinaryPath: 'task'
}

export class EgoRockSettingsTab extends PluginSettingTab {
	plugin: EgoRock

	constructor(app: App, plugin: EgoRock) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		let { containerEl } = this

		containerEl.empty()

		new Setting(containerEl)
			.setName('Taskwarrior binary path')
			.setDesc('The path to the taskwarrior binary. If task is on the system PATH, "task" should work. Otherwise, provide an absolute path. WSL systems can invoke taskwarrior running in WSL from windows with the path "wsl task".')
			.addText((text) =>
				text
					.setPlaceholder("task")
					.setValue(this.plugin.settings.taskBinaryPath)
					.onChange(async (value) => {
						this.plugin.settings.taskBinaryPath = value
						await this.plugin.saveSettings()
					})
			)
	}
}

export default class EgoRock extends Plugin {
	settings: Settings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new EgoRockSettingsTab(this.app, this))

		this.registerMarkdownCodeBlockProcessor('task-table', (source, element, context) => {
			this.doCommandReturnString(parseYaml(source).command, element)
		})
	}

	onunload() {
	}

	buildTable(tableDescription: any, el: any) {
		const [columns, rows] = tableDescription
		const tableEl = el.createEl('table')
		const headerEl = tableEl.createEl('thead').createEl('tr')
		for (let i = 0; i < columns.length; i++) {
			headerEl.createEl('th', {
				attr: { scope: 'col' },
				text: columns[i].columnName
			})
		}
		const body = tableEl.createEl('tbody')
		for (let i = 0; i < rows.length; i++) {
			const rowEl = body.createEl('tr')
			for (let j = 0; j < columns.length; j++) {
				rowEl.createEl('td', {
					text: rows[i][columns[j].columnName],
					attr: { scope: columns[j].columnName.toLowerCase() === 'id' ? 'row' : undefined }
				})
			}
		}
	}

	buildTableDescription(table: Array<string>) {
		const indices: Array<any> = []
		const header = table[0]
		const rows = []

		const headerEntries = header.split(' ').filter(word => !!word)
		let previousHeaderIndex = 0

		for(let headerEntryIndex = 0; headerEntryIndex < headerEntries.length; headerEntryIndex++) {
			let stringToFind = headerEntries[headerEntryIndex]
			let stringFound = false
			for (let charIndex = previousHeaderIndex; charIndex <= table[0].length; charIndex++) {
				if (!stringFound && header.slice(previousHeaderIndex, charIndex) === stringToFind) {
					stringFound = true
				}
				if (stringFound && header[charIndex] !== ' ') {
					indices.push({ columnName: stringToFind.trim(), startIndex: previousHeaderIndex, endIndex: charIndex, columnIndex: headerEntryIndex })
					previousHeaderIndex = charIndex
					break
				}
			}
		}

		for(let rowIndex = 1; rowIndex < table.length; rowIndex++) {
			let rowObj: Record<string, any> = {}
			for (let columnIndex = 0; columnIndex < indices.length; columnIndex++) {
				if (columnIndex !== indices.length - 1) {
				rowObj[indices[columnIndex].columnName] = table[rowIndex].slice(indices[columnIndex].startIndex, indices[columnIndex].endIndex).trim()
				} else {
				rowObj[indices[columnIndex].columnName] = table[rowIndex].slice(indices[columnIndex].startIndex).trim()
				}
			}
			rows.push(rowObj)
		}

		return [indices, rows]
	}

	doCommandReturnString(commandString: string, el: any) {
		commandString = commandString.replace(/^task /, '')
		const reports = this.getReportNames()
		const report = commandString.split(' ').slice(-1)[0]
		const taskwarriorBin = this.settings.taskBinaryPath
		if (reports.includes(report)) {
			const newCommand = `${taskwarriorBin.trim()} rc.detection:off rc.defaultwidth:1000 ${commandString}`
			const asciiTable = execSync(newCommand).toString().split('\n')
			    .filter((line) => {
					if (line.match(/^[ -]*$/)) return false
					if (line.match(/^\d+ tasks*$/)) return false
					if (line.match(/^\d+ tasks, \d+ shown*$/)) return false
					return true
				})
			return this.buildTable(this.buildTableDescription(asciiTable), el)
		} else {
			throw new Error(`Taskwarrior command must be a report, was: ${report}.`)
		}
	}

	doCommand(commandString: string) {
		const reports = this.getReportNames()
		const report = commandString.split(' ')[0]
		const taskwarriorBin = this.settings.taskBinaryPath
		if (reports.includes(report)) {
			const newCommand = `${taskwarriorBin.trim()} ${this.buildCommandForReport(report)}`
			return JSON.parse(execSync(newCommand).toString())
		} else if (report === 'export') {
			return JSON.parse(execSync(`${taskwarriorBin.trim()} ${commandString}`).toString())
		} else {
			throw new Error(`Taskwarrior command must either be a report or export, was: ${report}.`)
		}
	}

	getReport(report: string) {
		return this.getReports().reduce((result, line) => {
			const regex = RegExp(`report\.${report}\.([^ ]*) +(.+)`)
			const matches = regex.exec(line)
			if (matches) {
				result[matches[1].toString()] = matches[2]
				return result
			} else {
				return result
			}
		}, {} as Record<string, string>)
	}

	// TODO: merge with user-provided info
	buildCommandForReport(report: string) {
		return this.getReports().reduce((result, line) => {
			const regex = RegExp(`report\.${report}.([^ ]*) +(.+)`)
			const matches = regex.exec(line)
			if (matches) {
				return `${result} rc.${matches[1]}="${matches[2]}"`
			} else {
				return result
			}
		}, 'export')
	}

	getReports() {
		const taskwarriorBin = this.settings.taskBinaryPath
		const lines = execSync(`${taskwarriorBin} task show report`).toString().split('\n').filter(line => line.match(/^report\..+/))
		return lines
	}

	getReportNames() {
		return this.getReports().reduce((result, line) => {
			// TODO: could this be report.regex instead of regex.regex? see getReportSettings
			const matches = /^[^\.]+\.([^\.]+).*/.exec(line)
			if (matches && matches[1] && !result.includes(matches[1]))
				return [ ...result, matches[1] ]
			return result
		}, [] as String[])
	}

	// we could instead use export, but that won't work with reports
	// we could read the report, _then_ export with the report's filter provided
	// but for now, let's take the easy / naive way out
	parseReport(reportString: string) {
		const lines = reportString.split('\n').filter(line => !!line)
		const columns = lines[0].split(' ').filter(line => !!line)
		return {
			columns: columns,
			rows: lines.slice(1)
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
