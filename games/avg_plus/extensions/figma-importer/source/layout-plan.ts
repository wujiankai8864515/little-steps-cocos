/**
 * Pure layout inference shared by the importer and unit tests.
 * Figma wrap layouts are represented as a regular grid only when their
 * exported child coordinates provide a stable row/column model.
 */

export interface GridLayoutPlan {
    startAxis: 'HORIZONTAL' | 'VERTICAL';
    constraint: 'FIXED_ROW' | 'FIXED_COL';
    constraintNum: number;
    cellWidth: number;
    cellHeight: number;
    spacingX: number;
    spacingY: number;
}

export interface NativeGridLayoutPlan {
    startAxis: 'HORIZONTAL';
    constraint: 'FIXED_COL';
    constraintNum: number;
    cellWidth: number;
    cellHeight: number;
    spacingX: number;
    spacingY: number;
}

const GRID_TOLERANCE = 4;

function cluster(values: number[], tolerance: number): number[] {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    const clusters: number[] = [];
    for (const value of sorted) {
        const last = clusters[clusters.length - 1];
        if (last == null || Math.abs(last - value) > tolerance) clusters.push(value);
        else clusters[clusters.length - 1] = (last + value) / 2;
    }
    return clusters;
}

function nearest(values: number[], value: number): number {
    let best = Infinity;
    for (const candidate of values) best = Math.min(best, Math.abs(candidate - value));
    return best;
}

/**
 * Infer a Cocos Grid layout from a Figma HORIZONTAL/VERTICAL WRAP node.
 * Returns null when the geometry is not regular enough for native cc.Layout.
 */
export function inferWrapGridLayout(node: any): GridLayoutPlan | null {
    if (!node || node.layoutWrap !== 'WRAP') return null;
    if (node.layoutMode !== 'HORIZONTAL' && node.layoutMode !== 'VERTICAL') return null;
    const children = (node.children || []).filter((child: any) =>
        child && child.visible !== false && child.layoutPositioning !== 'ABSOLUTE'
    );
    if (children.length < 2) return null;

    const widths = children.map((child: any) => Number(child.width) || 0);
    const heights = children.map((child: any) => Number(child.height) || 0);
    const cellWidth = Math.max(...widths);
    const cellHeight = Math.max(...heights);
    if (cellWidth <= 0 || cellHeight <= 0) return null;
    if (Math.max(...widths) - Math.min(...widths) > GRID_TOLERANCE ||
        Math.max(...heights) - Math.min(...heights) > GRID_TOLERANCE) return null;

    const xCenters = children.map((child: any) => (Number(child.x) || 0) + (Number(child.width) || 0) / 2);
    const yCenters = children.map((child: any) => (Number(child.y) || 0) + (Number(child.height) || 0) / 2);
    const columns = cluster(xCenters, GRID_TOLERANCE);
    const rows = cluster(yCenters, GRID_TOLERANCE);
    if (columns.length < 2 && rows.length < 2) return null;

    const horizontalStart = node.layoutMode === 'HORIZONTAL';
    const columnCount = columns.length;
    const rowCount = rows.length;
    const expected = columnCount * rowCount;
    // A sparse set of occupied cells is not a stable native Grid: Cocos would
    // compact the children and change their authored positions. Keep absolute
    // positioning unless every inferred row/column cell is represented.
    if (expected !== children.length) return null;

    // Every child must land on a unique known row/column cell. Require at least
    // one complete row and column so staggered coordinates do not become a grid.
    const rowCells = new Map<number, Set<number>>();
    const columnCells = new Map<number, Set<number>>();
    for (let i = 0; i < children.length; i++) {
        if (nearest(columns, xCenters[i]) > GRID_TOLERANCE || nearest(rows, yCenters[i]) > GRID_TOLERANCE) return null;
        const row = rows.reduce((best, value, index) => Math.abs(value - yCenters[i]) < Math.abs(rows[best] - yCenters[i]) ? index : best, 0);
        const column = columns.reduce((best, value, index) => Math.abs(value - xCenters[i]) < Math.abs(columns[best] - xCenters[i]) ? index : best, 0);
        const cells = rowCells.get(row) || new Set<number>();
        if (cells.has(column)) return null;
        cells.add(column);
        rowCells.set(row, cells);
        const columnRows = columnCells.get(column) || new Set<number>();
        columnRows.add(row);
        columnCells.set(column, columnRows);
    }
    if (Math.max(...Array.from(rowCells.values()).map((cells) => cells.size)) !== columnCount ||
        Math.max(...Array.from(columnCells.values()).map((cells) => cells.size)) !== rowCount) return null;

    const itemSpacing = Number(node.itemSpacing) || 0;
    const counterSpacing = Number(node.counterAxisSpacing) || 0;
    return horizontalStart ? {
        startAxis: 'HORIZONTAL',
        constraint: 'FIXED_COL',
        constraintNum: columnCount,
        cellWidth,
        cellHeight,
        spacingX: itemSpacing,
        spacingY: counterSpacing,
    } : {
        startAxis: 'VERTICAL',
        constraint: 'FIXED_ROW',
        constraintNum: rowCount,
        cellWidth,
        cellHeight,
        spacingX: counterSpacing,
        spacingY: itemSpacing,
    };
}

/**
 * Infer a Cocos Grid layout from Figma's native `layoutMode = GRID`.
 * Figma's grid tracks can be wider than their children, so cellSize is the
 * track size rather than the largest child size. This preserves authored
 * column/row origins when resizeMode is NONE.
 */
export function inferNativeGridLayout(node: any): NativeGridLayoutPlan | null {
    if (!node || node.layoutMode !== 'GRID') return null;

    const columns = Number(node.gridColumnCount);
    const rows = Number(node.gridRowCount);
    const gapX = Math.max(0, Number(node.gridColumnGap) || 0);
    const gapY = Math.max(0, Number(node.gridRowGap) || 0);
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) return null;

    const padding = node.padding || {
        left: Number(node.paddingLeft) || 0,
        right: Number(node.paddingRight) || 0,
        top: Number(node.paddingTop) || 0,
        bottom: Number(node.paddingBottom) || 0,
    };
    const width = Number(node.width) || 0;
    const height = Number(node.height) || 0;
    const cellWidth = (width - (Number(padding.left) || 0) - (Number(padding.right) || 0) - gapX * (columns - 1)) / columns;
    const cellHeight = (height - (Number(padding.top) || 0) - (Number(padding.bottom) || 0) - gapY * (rows - 1)) / rows;
    if (!(cellWidth > 0) || !(cellHeight > 0)) return null;

    const children = (node.children || []).filter((child: any) =>
        child && child.visible !== false && child.layoutPositioning !== 'ABSOLUTE'
    );
    // Cocos has no equivalent of Figma's sparse/hidden grid tracks. Avoid
    // compacting authored cells when the full grid is not represented.
    if (children.length !== columns * rows) return null;
    if (children.some((child: any) =>
        Number(child.width) > cellWidth + GRID_TOLERANCE || Number(child.height) > cellHeight + GRID_TOLERANCE
    )) return null;

    return {
        startAxis: 'HORIZONTAL',
        constraint: 'FIXED_COL',
        constraintNum: columns,
        cellWidth,
        cellHeight,
        spacingX: gapX,
        spacingY: gapY,
    };
}
