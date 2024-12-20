import { Component, OnDestroy } from '@angular/core';
import { ChessBoard } from '../../board/board';
import {
  CellWithFigure,
  Color,
  Coordinate,
  Figure,
  FigureImageSource,
  KingChecking,
  LastMove,
  promotedFigureTypes,
  SafeMoves,
  SelectedCell,
  ShotDownFigureImageSource,
} from '../../interfaces/figures.interface';
import { CommonModule } from '@angular/common';
import { isEquel } from '../../utils/helpers';
import { FigurePiece } from '../../figures/figures';
import { AbsPipe } from '../../utils/pipes/abs.pipe';
import { YcoordinateConverterPipe } from '../../utils/pipes/y-coordinate-converter.pipe';
import { ChessApiService } from '../../services/chess-api.service';
import { finalize, Subject, takeUntil } from 'rxjs';
import {
  FormBuilder,
  ReactiveFormsModule,
  UntypedFormGroup,
  Validators,
} from '@angular/forms';
import { MatProgressBarModule } from '@angular/material/progress-bar';
@Component({
  selector: 'app-chess-board',
  standalone: true,
  imports: [
    CommonModule,
    AbsPipe,
    YcoordinateConverterPipe,
    ReactiveFormsModule,
    MatProgressBarModule,
  ],
  templateUrl: './chess-board.component.html',
  styleUrl: './chess-board.component.scss',
})
export class ChessBoardComponent implements OnDestroy {
  private chessBoard: ChessBoard = new ChessBoard();
  private selectedCell: SelectedCell = { figure: null };
  private figureSafeCells: Coordinate[] = [];
  private promotionCoordinate: Coordinate | null = null;
  private promotedFigure: Figure | null = null;
  private checkState: KingChecking = this.chessBoard.checkingKing;
  private destroy$ = new Subject();
  form: UntypedFormGroup;

  figureImageSource = FigureImageSource;
  shotDownFigureImageSource = ShotDownFigureImageSource;
  shotDownFigures = this.chessBoard.shotDownFigures;
  recordedMoves: LastMove[] = [];
  isPromotionActive: boolean = false;
  isBoardFlipped: boolean = false;
  isSideChanged: boolean = false;
  isNewGame: boolean = true;
  evalValue: number = 0;
  loadingMoves: boolean = false;

  chessBoard$ = this.chessBoard.chessBoardSubject$;

  get chessBoardFigures(): (FigurePiece | null)[][] {
    return this.chessBoard.chessBoardFigures;
  }

  get lastMove(): LastMove | undefined {
    return this.chessBoard.lastMove;
  }

  get isGameOver(): boolean {
    return this.chessBoard.isGameOver;
  }
  get gameOverMessage(): string | undefined {
    return this.chessBoard.gameOverMessage;
  }

  get playerColor(): Color {
    return this.chessBoard._activePlayerColor;
  }

  set playerColor(color: Color) {
    this.chessBoard._activePlayerColor = color;
  }

  get computerMode() {
    return this.chessBoard._computerMode;
  }

  set computerMode(v: boolean) {
    this.chessBoard._computerMode = v;
  }

  get safeCells(): SafeMoves {
    return this.chessBoard.safeCells;
  }

  get chessBoardAsFEN(): string {
    return this.chessBoard.boardAsFEN;
  }

  get showMoveIndex(): number {
    return this.chessBoard.showMoveIndex;
  }

  get movesCounter(): number {
    return this.chessBoard.movesCounter;
  }

  availablePromotionFigureTypes(): Figure[] {
    return this.playerColor === Color.White
      ? promotedFigureTypes.whiteList
      : promotedFigureTypes.blaclList;
  }

  constructor(private chessApi: ChessApiService, private fb: FormBuilder) {
    this.form = this.fb.group({
      side: [false, Validators.required],
      mode: [false, Validators.required],
    });
  }

  getBestMove(forceGetBestMove: boolean = false) {
    this.loadingMoves = true;
    this.chessApi
      .getBestMove(this.chessBoard.boardAsFEN)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.loadingMoves = false))
      )
      .subscribe((res) => {
        const playerSide: Color = this.isSideChanged
          ? Color.Black
          : Color.White;

        this.evalValue = Number(res.eval);

        if (
          forceGetBestMove ||
          (this.computerMode && playerSide !== this.playerColor)
        ) {
          const { prevX, prevY, newX, newY, promotedPiece } = res.bestMove;
          setTimeout(
            () => this.updateBoard(prevX, prevY, newX, newY, promotedPiece),
            1000
          );
        }
      });
  }

  isCellDark(x: number, y: number): boolean {
    return ChessBoard.isCellDark(x, y);
  }

  isCellSelected(x: number, y: number): boolean {
    return this.selectedCell.x === x && this.selectedCell.y === y;
  }

  isCellSafeForSelectedFigure(x: number, y: number): boolean {
    return this.figureSafeCells.some(
      (mooves) => mooves.x === x && mooves.y === y
    );
  }

  isCellSafeForAttackBySelectedFigure(x: number, y: number): boolean {
    return (
      this.figureSafeCells.some((mooves) => mooves.x === x && mooves.y === y) &&
      this.chessBoardFigures[x][y] !== null
    );
  }

  isCellPrevMove(x: number, y: number): boolean {
    if (!this.lastMove) return false;
    const { prevX, prevY, currX, currY } = this.chessBoard.lastMove!;
    return (x === prevX && y === prevY) || (x === currX && y === currY);
  }

  isKingChecked(x: number, y: number): boolean {
    return (
      this.checkState.isInCheck &&
      this.checkState.x === x &&
      this.checkState.y === y
    );
  }

  // является ли клетка выбранной для превращения
  isCellPromotionCell(x: number, y: number): boolean {
    if (!this.promotionCoordinate) return false;
    return this.promotionCoordinate.x === x && this.promotionCoordinate.y === y;
  }

  move(x: number, y: number): void {
    if (this.isGameOver) return;
    const piece: FigurePiece | null = this.chessBoardFigures[x][y];
    if (isEquel(this.selectedCell, { figure: piece?.figure || null, x, y })) {
      // удаляем выбранную фигуру и ее возможные ходы,
      // если до этого её выбрали и выходим из функции.
      this.selectedCell = { figure: null };
      this.figureSafeCells = [];

      // если кликнули на туже пешку, то убираем модалку превращения
      if (this.isPromotionActive) {
        this.isPromotionActive = false;
        this.promotionCoordinate = null;
      }
      return;
    } else if (
      this.selectedCell.figure &&
      this.isCellSafeForSelectedFigure(x, y)
    ) {
      // в противном случае, если уже была выбрана фигура
      // и мы выбрали возможный для нее ход,
      // перемещаем ее и просто выходим из функции.
      this.replaceFigure(x, y, this.selectedCell);
      return;
    }

    if (piece?.figure) {
      // если кликнули на другую клетку, то убираем модалку превращения,
      // если она была открыта
      if (this.isPromotionActive) {
        this.isPromotionActive = false;
        this.promotionCoordinate = null;
      }
      // если проверки выше не прошли, значит мы первый раз выбрали фигуру(клетку),
      // значит засетим ей ячейку и возможные доступные ходы, если выбрана клетка.
      this.selectedCell = { figure: piece.figure, x, y };
      this.figureSafeCells = this.safeCells.get(x + ',' + y) || [];
      return;
    }

    // если ничего выше не произошло, просто сетим выбранную ячейку и обнуляем возможно выбранные ранее мувы
    this.selectedCell = { figure: null, x, y };
    this.figureSafeCells = [];

    // закрытие модалки превращения, если решили не превращать пешку и кликнули на пустую клету
    if (this.isPromotionActive) {
      this.isPromotionActive = false;
      this.promotionCoordinate = null;
    }
  }

  replaceFigure(
    newX: number,
    newY: number,
    selectedCell: CellWithFigure
  ): void {
    // является ли выбранная фигура пешкой и мы пытаемся ей походить
    const isPawnSelected: boolean =
      this.chessBoardFigures[selectedCell.x][selectedCell.y]?.figure ===
        Figure.WhitePawn ||
      this.chessBoardFigures[selectedCell.x][selectedCell.y]?.figure ===
        Figure.BlackPawn;

    // стоит на ряду перед превращением
    const isPawnOnLastYrow: boolean =
      isPawnSelected && (newX === 7 || newX === 0);

    // если модалка превращения закрыта и пешка стоит на последнем ряду
    const isPromotionModalOpen: boolean =
      !this.isPromotionActive && isPawnOnLastYrow;

    // то убираем возможные ходы для того чтобы пометить координаты превращения
    // убираем другие доступные ходы пока ждем выбора и открываяем модалку с фигурами
    if (isPromotionModalOpen) {
      this.figureSafeCells = [];
      this.isPromotionActive = true;
      this.promotionCoordinate = { x: newX, y: newY };

      // ждем выбора фигуры
      return;
    }

    this.updateBoard(
      this.selectedCell.x!,
      this.selectedCell.y!,
      newX,
      newY,
      this.promotedFigure
    );
  }

  updateBoard(
    prevX: number,
    prevY: number,
    newX: number,
    newY: number,
    promotedFigure: Figure | null
  ): void {
    this.chessBoard.moveFigure(prevX, prevY, newX, newY, promotedFigure);
    this.checkState = this.chessBoard.checkingKing;
    this.recordedMoves.push(this.lastMove!);
    this.unmarkingSelectionAndSafeMoves();
    if (!this.isGameOver) {
      this.getBestMove();
    }
  }

  // отрабрабатывает по клику по фигуре в модалке превращения
  promoteFigure(figure: Figure): void {
    if (!this.promotionCoordinate || !this.selectedCell.figure) return;

    // важно задать фигуру превращения
    this.promotedFigure = figure;
    const { x: newX, y: newY } = this.promotionCoordinate;
    const { x: prevX, y: prevY } = this.selectedCell;
    // перемещает пешку как бы, но из-за того что уже есть промоутед фигура, она передастся как параметр и совершится именно превращение. Обнуление модалки происходит дальше
    this.updateBoard(prevX, prevY, newX, newY, this.promotedFigure);
  }

  private unmarkingSelectionAndSafeMoves(): void {
    this.figureSafeCells = [];
    this.selectedCell = { figure: null };

    // обнуление модалки если она была открыта
    if (this.isPromotionActive) {
      this.isPromotionActive = false;
      this.promotedFigure = null;
      this.promotionCoordinate = null;
    }
  }

  // закрывается по клику во вью
  closePawnPromotion(): void {
    this.unmarkingSelectionAndSafeMoves();
  }

  restartGame(): void {
    this.selectedCell = { figure: null };
    this.figureSafeCells = [];
    this.recordedMoves = [];
    this.isNewGame = true;
    this.evalValue = 0;
    this.chessBoard.restartGame();
  }

  surrenderGame(): void {
    this.chessBoard.surrenderGame();
  }

  flipBoard(): void {
    this.isBoardFlipped = !this.isBoardFlipped;
  }

  chooseSide(event: Event): void {
    const target: HTMLInputElement = event.target as HTMLInputElement;
    this.isSideChanged = target.checked;
    this.flipBoard();
  }

  chooseMode(event: Event): void {
    const target: HTMLInputElement = event.target as HTMLInputElement;
    this.computerMode = target.checked;
  }

  startGame() {
    this.isNewGame = false;

    if (this.isSideChanged && this.computerMode) {
      this.getBestMove();
    }
  }

  showMove(move: number): void {
    this.chessBoard.showMoveFromChessBoardHistory(move);
  }

  ngOnDestroy() {
    this.destroy$.complete();
  }
}
