from datetime import datetime


def obter_data_formatada() -> str:
    meses = {
        1: "janeiro",
        2: "fevereiro",
        3: "marco",
        4: "abril",
        5: "maio",
        6: "junho",
        7: "julho",
        8: "agosto",
        9: "setembro",
        10: "outubro",
        11: "novembro",
        12: "dezembro",
    }
    hoje = datetime.now()
    return f"{hoje.day:02d} de {meses[hoje.month]} de {hoje.year}"
