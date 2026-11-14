// Template rendering shared by orchestration and judging.
/** Replace each {{NAME}} by its value in one pass, so a value that contains a placeholder is left alone. */
export function render(template: string, values: Record<string, string>): string {
	return template.replace(/\{\{([A-Z]+)\}\}/g, (whole, name: string) => (name in values ? values[name] : whole));
}

