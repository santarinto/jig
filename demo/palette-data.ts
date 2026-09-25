/* СГЕНЕРИРОВАНО для DS-122, палитра заменена на JIG-12 — не править руками.
 *
 * `tokens` — палитра, которая СЕЙЧАС лежит в tokens.css. Стенд её не подставляет
 * (вариант «как есть» ничего не переопределяет), поэтому расходиться нечему;
 * сами восемь значений нужны лишь для самопроверки фильтра, и их совпадение с
 * tokens.css держит гейт chartPalette.test.ts, а не договорённость.
 * `previous` — палитра DS-122, до замены JIG-12, для сравнения.
 *
 * Числа: CAM16-UCS, условия просмотра свои у каждой темы, плюс симуляция
 * дихромазии по Machado 2009 (severity 1.0, матрицы в ЛИНЕЙНОМ RGB).
 * Реализация сверена с эталоном CIECAM02 (XYZ 19.01/20/21.78, La=318.31 →
 * J=41.73, h=219.0) и продублирована независимо на numpy.
 *
 * `SIM` — те же цвета, прогнанные симуляцией ЗДЕСЬ. Стенд рисует их рядом с тем,
 * что даёт feColorMatrix в браузере: разойдутся ряды — браузерная симуляция
 * считает не то, и всей картинке верить нельзя. Проверено: 46 из 48 значений
 * совпали побитово, худшее расхождение — один младший бит (0.86 ΔE, ниже JND).
 */
export type PalKey = 'tokens' | 'previous'
export type Vision = 'normal' | 'protan' | 'deutan' | 'tritan'
export type Theme = 'light' | 'dark'
export interface VisionMetric { min: number; worstPair: [number, number] }
export interface ThemeMetric { normal: VisionMetric; protan: VisionMetric; deutan: VisionMetric; tritan: VisionMetric; worst: number }

export const PALETTES: Record<PalKey, Record<Theme, string[]>> = {"tokens":{"light":["#0B7979","#9D7C12","#830FFA","#138EB7","#C32739","#42650C","#4E5CC2","#B65C8B"],"dark":["#42C6C6","#B59545","#B875FC","#4297BA","#CE6A6D","#A2C543","#A1A5E8","#B46F88"]},"previous":{"light":["#0B7979","#8F9A00","#D11679","#A579A5","#8F6316","#379AE7","#6E58D1","#C6796E"],"dark":["#42C6C6","#8F8F0B","#FF2C9A","#B063FF","#E7A558","#4D9ABB","#9AA5FD","#D1796E"]}}

export const SIM: Record<PalKey, Record<Theme, Record<Vision, string[]>>> = {"tokens":{"light":{"normal":["#0B7979","#9D7C12","#830FFA","#138EB7","#C32739","#42650C","#4E5CC2","#B65C8B"],"protan":["#707279","#8C7B00","#0063FF","#788CB9","#575138","#6A5D00","#1F6BC6","#65708D"],"deutan":["#62687A","#94841A","#005EF6","#647DB6","#7E7234","#655A17","#0061C0","#7D8089"],"tritan":["#007D79","#AB706A","#5F6494","#009A9C","#D70030","#446055","#007486","#C1596E"]},"dark":{"normal":["#42C6C6","#B59545","#B875FC","#4297BA","#CE6A6D","#A2C543","#A1A5E8","#B46F88"],"protan":["#B9BDC6","#A5943D","#4693FF","#8594BC","#807B6D","#D0B931","#91ADEB","#787C89"],"deutan":["#A5AEC7","#AC9C48","#5C95F9","#7488BA","#98906B","#CBB84D","#8EA8E6","#898886"],"tritan":["#00CCC6","#C38A83","#AC8EAE","#00A1A2","#DF5D6C","#AABBAB","#8FB1BD","#BE6C78"]}},"previous":{"light":{"normal":["#0B7979","#8F9A00","#D11679","#A579A5","#8F6316","#379AE7","#6E58D1","#C6796E"],"protan":["#707279","#A69200","#49587B","#7684A7","#736505","#769DEA","#006FD5","#8A846D"],"deutan":["#62687A","#A6941A","#7B7A75","#8089A3","#7D7019","#5D8DE6","#0068CE","#9D946D"],"tritan":["#007D79","#999082","#E30049","#A87D89","#9C5755","#00ADB6","#4D738C","#D56E76"]},"dark":{"normal":["#42C6C6","#8F8F0B","#FF2C9A","#B063FF","#E7A558","#4D9ABB","#9AA5FD","#D1796E"],"protan":["#B9BDC6","#9C8800","#5E719D","#0088FF","#BBA951","#8998BD","#87AFFF","#8D866D"],"deutan":["#A5AEC7","#9D8C1C","#989895","#388AFC","#CBB85A","#798CBB","#81A8FB","#A2986D"],"tritan":["#00CCC6","#9A8579","#FF0061","#A184A8","#FA9593","#00A3A5","#7CB6C5","#E26C76"]}}}

export const METRICS: Record<PalKey, Record<Theme, ThemeMetric>> = {"tokens":{"light":{"normal":{"min":8.61,"worstPair":[1,4]},"protan":{"min":5.89,"worstPair":[3,7]},"deutan":{"min":5.77,"worstPair":[3,7]},"tritan":{"min":5.75,"worstPair":[1,7]},"worst":5.75},"dark":{"normal":{"min":5.74,"worstPair":[5,8]},"protan":{"min":5.86,"worstPair":[4,7]},"deutan":{"min":5.76,"worstPair":[2,6]},"tritan":{"min":5.72,"worstPair":[5,8]},"worst":5.72}},"previous":{"light":{"normal":{"min":9.42,"worstPair":[4,8]},"protan":{"min":7.33,"worstPair":[1,4]},"deutan":{"min":7.37,"worstPair":[1,4]},"tritan":{"min":7.6,"worstPair":[4,8]},"worst":7.33},"dark":{"normal":{"min":8.36,"worstPair":[1,6]},"protan":{"min":6.78,"worstPair":[6,7]},"deutan":{"min":6.48,"worstPair":[3,8]},"tritan":{"min":6.56,"worstPair":[5,8]},"worst":6.48}}}

/** Худшая пара у палитр, про которые известно, что они работают. Планка, а не украшение. */
export const BENCHMARKS = {"Tol bright":5.2,"Tol vibrant":5.6,"Okabe-Ito":6.41,"Tol muted":6.67} as const

/** Machado 2009, severity 1.0. Порядок построчный, для feColorMatrix. */
export const CVD_MATRICES: Record<Exclude<Vision, 'normal'>, number[]> = {"protan":[0.152286,1.052583,-0.204868,0.114503,0.786281,0.099216,-0.003882,-0.048116,1.051998],"deutan":[0.367322,0.860646,-0.227968,0.280085,0.672501,0.047413,-0.01182,0.04294,0.968881],"tritan":[1.255528,-0.076749,-0.178779,-0.078411,0.930809,0.147602,0.004733,0.691367,0.3039]}
