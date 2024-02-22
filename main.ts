import { App, Editor, MarkdownView, Modal, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { exec, execSync }  from 'child_process'
import { parse } from 'yaml'

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		this.addRibbonIcon('dice', 'Task lookup', () => {
			exec('wsl task list limit:1', (error, stdout, stderr) => {
				console.log(stdout)
				if (error) new Notice(error.message)
				else if (stderr && !stdout) new Notice(stderr)
				else new Notice(stdout/*.split('\n').join('\t')*/)
			})
		})
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor('task-table', (source, element, context) => {
			const div = element.createEl('div')
			div.innerHTML = 'input: ' + JSON.stringify(parse(source))

			const div2 = element.createEl('div')
			// div2.innerHTML = 'first item: ' + JSON.stringify(this.doCommand('waiting'), null, 4)
			const reportDetails = this.getReport('waiting')
			const div3 = element.createEl('div')
			// div3.innerHTML = 'report details: ' + JSON.stringify(reportDetails, null, 4)

			const columnNames = reportDetails.labels.split(',')
			const columnKeys = reportDetails.columns.split(',')
			const rows = this.doCommand('waiting')
			console.log('here')
			div2.innerHTML = 'columns: ' + JSON.stringify(columnNames)
			div3.innerHTML = 'first row: ' + JSON.stringify(rows[0])

			this.doCommandReturnString(parse(source).command, element)
		})
	}

	onunload() {

	}

	buildTable(tableDescription: any, el: any) {
		const [columns, rows] = tableDescription
		const tableEl = el.createEl('table')
		const headerEl = tableEl.createEl('thead').createEl('tr')
		for (let i = 0; i < columns.length; i++) {
			const column = headerEl.createEl('th', { attr: { scope: 'col' } })
			// column.innerHTML = columnNames[i]
			column.innerHTML = columns[i].columnName
		}
		const body = tableEl.createEl('tbody')
		for (let i = 0; i < rows.length; i++) {
			// TODO: promote id or description to th with attr scope row: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/table
			const rowEl = body.createEl('tr')
			for (let j = 0; j < columns.length; j++) {
				const cellEl = rowEl.createEl('td')
				cellEl.innerHTML = rows[i][columns[j].columnName]
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

		for(let i = 0; i < indices.length; i++) {
			console.log(indices[i].columnName, header.slice(indices[i].startIndex, indices[i].endIndex))
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

	doCommandReturnString(commandString: string, el: any, taskwarriorBin='wsl task') {
		commandString = commandString.replace(/^task /, '')
		const reports = this.getReportNames()
		const report = commandString.split(' ')[0]
		if (reports.includes(report)) {
			const newCommand = `${taskwarriorBin.trim()} rc.detection:off rc.defaultwidth:1000 ${commandString}`
			const asciiTable = execSync(newCommand).toString().split('\n')
			    .filter((line) => {
					if (line.match(/^[ -]*$/)) return false
					if (line.match(/^\d+ tasks*$/)) return false
					if (line.match(/^\d+ tasks, \d+ shown*$/)) return false
					return true
				})
			console.log(newCommand)
			return this.buildTable(this.buildTableDescription(asciiTable), el)
		} else {
			throw new Error(`Taskwarrior command must be a report, was: ${report}.`)
		}
	}

	doCommand(commandString: string, taskwarriorBin='wsl task') {
		const reports = this.getReportNames()
		const report = commandString.split(' ')[0]
		if (reports.includes(report)) {
			const newCommand = `${taskwarriorBin.trim()} ${this.buildCommandForReport(report)}`
			console.log(newCommand)
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
		const lines = execSync('wsl task show report').toString().split('\n').filter(line => line.match(/^report\..+/))
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
